"use client"

import { useState, useMemo, useEffect, Fragment } from "react"
import { useAccount, useWaitForTransactionReceipt, usePublicClient } from "wagmi"
import { parseEther, getAddress, isAddress, type Address, parseAbiItem } from "viem"
import { toast } from "sonner"
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock3, 
  Info, 
  Plus, 
  Search, 
  ShieldAlert, 
  ShieldCheck, 
  Trash2, 
  ChevronRight
} from "lucide-react"

import { 
  usePayrollAdminData, 
  type AdminWorkerRecord, 
  formatEth, 
  formatDuration, 
} from "@/hooks/use-payroll-admin-data"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { usePayrollWrite } from "@/hooks/use-payroll-write"
import { getPayrollContractConfig } from "@/lib/payroll-contract"
import { getTransactionToastDescription } from "@/lib/transaction-links"
import { cn } from "@/lib/utils"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"

// --- Types & Constants ---

type ProposalFilter = "all" | "expiring-soon" | "terminate-on-reject" | "expired"

const PROPOSAL_FILTERS = [
  { value: "all", label: "All" },
  { value: "expiring-soon", label: "Expiring Soon (<24h)" },
  { value: "terminate-on-reject", label: "Terminate on Reject" },
  { value: "expired", label: "Expired" },
]

const TIMELINE_OPTIONS = [
  { label: "Hourly", value: "0" },
  { label: "Monthly", value: "1" },
  { label: "Custom Interval", value: "2" },
  { label: "Trigger-based", value: "3" },
] as const

// --- Helper Functions ---

function parseEthOrThrow(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  try {
    return parseEther(trimmed)
  } catch {
    throw new Error(`${label} must be a valid number.`)
  }
}

function formatRateDisplay(record: { timeline: string; amountPerIntervalWei: bigint; intervalSeconds: bigint }) {
  if (record.timeline === "Trigger") return "—"
  const amount = formatEth(record.amountPerIntervalWei)
  let suffix = ""
  if (record.timeline === "Hourly") suffix = "/ hour"
  else if (record.timeline === "Monthly") suffix = "/ 30d"
  else suffix = `/ ${formatDuration(record.intervalSeconds)}`
  return `${amount} ETH ${suffix}`
}

function formatTimeRemaining(expiryTimestamp: bigint, now: bigint) {
  if (expiryTimestamp <= now) return <span className="text-destructive font-bold">Expired</span>

  const diff = expiryTimestamp - now
  const day = 86_400n
  const hour = 3_600n
  const minute = 60n

  if (diff > day * 2n) {
    return <span>{diff / day} days { (diff % day) / hour}h</span>
  }
  
  if (diff > hour * 1n) {
    const h = diff / hour
    const m = (diff % hour) / minute
    return <span className="text-amber-500 font-medium">{h}h {m}m</span>
  }
  
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
      <span className="text-destructive font-bold">
        {(diff / minute).toString().padStart(2, '0')}m {(diff % minute).toString().padStart(2, '0')}s
      </span>
    </div>
  )
}

function formatTimeExpired(expiryTimestamp: bigint, now: bigint) {
  const diff = now - expiryTimestamp
  if (diff < 60n) return "Just now"
  return `${formatDuration(diff)} ago`
}

function ProposalStatCard({
  label,
  value,
  subLabel,
  variant = "neutral",
  tooltip,
}: {
  label: string
  value: string | number | React.ReactNode
  subLabel: string
  variant?: "neutral" | "warning" | "danger"
  tooltip?: string
}) {
  const borderClass = {
    neutral: "border-border/50",
    warning: "border-l-4 border-l-amber-500 bg-amber-500/5",
    danger: "border-l-4 border-l-destructive bg-destructive/5",
  }[variant]

  const content = (
    <Card className={cn("overflow-hidden shadow-sm transition-all hover:shadow-md", borderClass)}>
      <CardHeader className="pb-2 pt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-sm text-muted-foreground/80 leading-tight">{subLabel}</p>
      </CardContent>
    </Card>
  )

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs font-medium">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}

export function ProposalsView() {
  const contract = getPayrollContractConfig()
  const { data, isLoading, refetch } = usePayrollAdminData()
  const publicClient = usePublicClient()
  
  const [now, setNow] = useState(BigInt(Math.floor(Date.now() / 1000)))
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(BigInt(Math.floor(Date.now() / 1000)))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<ProposalFilter>("all")
  const [proposalNotes, setProposalNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchNotes = async () => {
      if (!publicClient || !contract || !data?.workers) return
      
      const workersWithProposals = data.workers.filter(w => w.pendingProposal)
      if (workersWithProposals.length === 0) return

      try {
        // Fetch logs for each worker with a proposal
        // We do this in parallel for speed
        const notesMap: Record<string, string> = {}
        await Promise.all(workersWithProposals.map(async (worker) => {
          const logs = await publicClient.getLogs({
            address: contract.address,
            event: parseAbiItem('event TermsProposed(address indexed worker, uint8 timeline, uint256 amountPerIntervalWei, uint256 intervalSeconds, bool terminateOnReject, uint256 expiryTimestamp, string proposalNote)'),
            args: { worker: worker.address as Address },
            fromBlock: 'earliest'
          })
          if (logs.length > 0) {
            notesMap[worker.address] = logs[logs.length - 1].args.proposalNote || ""
          }
        }))
        setProposalNotes(prev => ({ ...prev, ...notesMap }))
      } catch (err) {
        console.error("Failed to fetch proposal notes:", err)
      }
    }

    fetchNotes()
  }, [publicClient, contract?.address, data?.workers])

  const [activeModal, setActiveModal] = useState<string | null>(null)
  const [selectedWorker, setSelectedWorker] = useState<AdminWorkerRecord | null>(null)

  const [formWorkerAddress, setFormWorkerAddress] = useState("")
  const [formTimeline, setFormTimeline] = useState("0")
  const [formAmount, setFormAmount] = useState("")
  const [formInterval, setFormInterval] = useState("")
  const [formProposalNote, setFormProposalNote] = useState("")
  const [formTerminateOnReject, setFormTerminateOnReject] = useState(false)
  const [formReviewWindowDays, setFormReviewWindowDays] = useState("")

  const { writeContractAsync, data: hash, isPending: isWalletPending } = usePayrollWrite()
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) {
      refetch()
    }
  }, [receipt.isSuccess, refetch])

  const workers = data?.workers ?? []
  const allProposals = workers.filter(w => w.pendingProposal)
  
  const activeProposals = allProposals.filter(w => w.pendingProposal!.expiryTimestamp > now)
  const expiredProposals = allProposals.filter(w => w.pendingProposal!.expiryTimestamp <= now)

  const filteredActiveProposals = useMemo(() => {
    return activeProposals.filter((worker) => {
      const matchesSearch = 
        worker.address.toLowerCase().includes(search.toLowerCase()) || 
        worker.metadata.toLowerCase().includes(search.toLowerCase()) ||
        worker.name.toLowerCase().includes(search.toLowerCase())
      
      const matchesFilter = 
        filter === "all" ||
        (filter === "expiring-soon" && worker.pendingProposal!.expiryTimestamp - now < 86400n) ||
        (filter === "terminate-on-reject" && worker.pendingProposal!.terminateOnReject)
      
      return matchesSearch && matchesFilter
    })
  }, [activeProposals, search, filter, now])

  const filteredExpiredProposals = useMemo(() => {
    return expiredProposals.filter((worker) => {
      const matchesSearch = 
        worker.address.toLowerCase().includes(search.toLowerCase()) || 
        worker.metadata.toLowerCase().includes(search.toLowerCase())
      return matchesSearch
    })
  }, [expiredProposals, search])

  const stats = useMemo(() => {
    const pending = allProposals.length
    const terminateOnReject = allProposals.filter(w => w.pendingProposal?.terminateOnReject).length
    const pausedByProposal = workers.filter(w => w.status === "paused" && w.pendingProposal).length
    const reviewWindow = data?.defaultProposalWindowSeconds ?? 0n
    
    return { pending, terminateOnReject, pausedByProposal, reviewWindow }
  }, [allProposals, workers, data?.defaultProposalWindowSeconds])

  async function executeWrite(actionLabel: string, callback: () => Promise<`0x${string}`>) {
    try {
      const nextHash = await callback()
      toast.success(`${actionLabel} submitted`, {
        description: getTransactionToastDescription(contract?.chainId, nextHash),
      })
      setActiveModal(null)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Transaction failed."
      toast.error(actionLabel, { description: message })
    }
  }

  const handleProposeAction = (worker?: AdminWorkerRecord) => {
    if (worker) {
      setSelectedWorker(worker)
      setFormWorkerAddress(worker.address)
      setFormTimeline("0")
      setFormAmount("")
      setFormInterval("")
      setFormProposalNote("")
      setFormTerminateOnReject(false)
    } else {
      setSelectedWorker(null)
      setFormWorkerAddress("")
      setFormTimeline("0")
      setFormAmount("")
      setFormInterval("")
      setFormProposalNote("")
      setFormTerminateOnReject(false)
    }
    setActiveModal("propose")
  }

  const handleEditWindowAction = () => {
    setFormReviewWindowDays((Number(stats.reviewWindow) / 86400).toString())
    setActiveModal("edit-window")
  }

  return (
    <TooltipProvider>
      <div className="space-y-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ProposalStatCard
            label="Pending Proposals"
            value={stats.pending}
            subLabel="Awaiting worker response"
            variant={stats.pending > 0 ? "warning" : "neutral"}
          />
          <ProposalStatCard
            label="Terminate on Reject"
            value={stats.terminateOnReject}
            subLabel="Worker terminated if rejected or expired"
            variant={stats.terminateOnReject > 0 ? "danger" : "neutral"}
            tooltip="If the worker rejects or the proposal expires, they will be permanently deactivated. Their accrued balance remains claimable."
          />
          <ProposalStatCard
            label="Paused Workers"
            value={stats.pausedByProposal}
            subLabel="Accrual halted until resolved"
            variant={stats.pausedByProposal > 0 ? "warning" : "neutral"}
          />
          <ProposalStatCard
            label="Review Window"
            value={
              <div className="flex items-center gap-2">
                <span>{formatDuration(stats.reviewWindow)}</span>
                <Button variant="link" className="h-auto p-0 text-xs font-bold text-primary" onClick={handleEditWindowAction}>
                  Edit
                </Button>
              </div>
            }
            subLabel="Default response window for new proposals"
            tooltip="Only affects proposals created after this change"
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by worker address or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filter} onValueChange={(v) => setFilter(v as ProposalFilter)}>
              <SelectTrigger className="w-[180px] rounded-xl">
                <SelectValue placeholder="Filter..." />
              </SelectTrigger>
              <SelectContent>
                {PROPOSAL_FILTERS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={() => handleProposeAction()} className="gap-2 rounded-xl h-10 px-5 shadow-sm">
              <Plus className="h-4 w-4" />
              Propose Terms
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Active Proposals</h2>
              <p className="text-[11px] text-muted-foreground/60 font-medium">Live reads from pendingTerms(worker) across the indexed worker set.</p>
            </div>
            <div className="h-px flex-1 bg-border/40" />
          </div>

          {filteredActiveProposals.length > 0 ? (
            <div className="rounded-[24px] border border-border/60 bg-card overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-b border-border/60">
                    <TableHead className="w-[280px] font-bold text-xs uppercase tracking-widest py-4">Worker</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest">Current Terms</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest">Proposed Terms</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest">Time Remaining</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActiveProposals.map((worker) => {
                    const proposal = worker.pendingProposal!
                    const isHighStakes = proposal.terminateOnReject
                    const isUrgent = proposal.expiryTimestamp - now < 3600n
                    const timelineChanged = worker.timeline !== proposal.timeline
                    const rateSignificantChange = proposal.amountPerIntervalWei > (worker.amountPerIntervalWei * 120n / 100n)
                    const note = proposalNotes[worker.address]

                    return (
                      <Fragment key={worker.address}>
                        <TableRow 
                          className={cn(
                            "group border-b border-border/40 transition-colors hover:bg-muted/20",
                            isHighStakes && "border-l-4 border-l-destructive/50",
                            isUrgent && "border-l-4 border-l-destructive animate-pulse"
                          )}
                        >
                          <TableCell className="py-5">
                            <div className="space-y-1.5">
                              <p className="font-mono text-sm font-bold tracking-tight">
                                {worker.address.slice(0, 6)}...{worker.address.slice(-4)}
                              </p>
                              <p className="text-[11px] text-muted-foreground/70 font-medium truncate max-w-[200px]">
                                {worker.metadata || "No metadata"}
                              </p>
                              {isHighStakes && (
                                <Badge variant="destructive" className="text-[9px] h-4 px-1.5 font-bold uppercase tracking-wider">
                                  Terminates on Reject
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Current</p>
                              <p className="text-xs font-medium text-muted-foreground">
                                {formatRateDisplay(worker)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Proposed</p>
                              <p className={cn(
                                "text-sm font-bold",
                                (timelineChanged || rateSignificantChange) ? "text-primary" : "text-foreground"
                              )}>
                                {formatRateDisplay({
                                  timeline: proposal.timeline,
                                  amountPerIntervalWei: proposal.amountPerIntervalWei,
                                  intervalSeconds: proposal.intervalSeconds
                                })}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {formatTimeRemaining(proposal.expiryTimestamp, now)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl h-8 px-3"
                              onClick={() => {
                                setSelectedWorker(worker)
                                setActiveModal("cancel")
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Cancel
                            </Button>
                          </TableCell>
                        </TableRow>
                        {note && (
                          <TableRow className="bg-muted/5 border-b border-border/40 hover:bg-muted/5">
                            <TableCell colSpan={5} className="py-2.5 px-8">
                              <p className="text-[11px] font-medium text-muted-foreground/80 leading-relaxed">
                                <span className="font-bold text-muted-foreground/40 mr-1.5 text-[9px] uppercase tracking-wider">📝 Note:</span>
                                {note}
                              </p>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 rounded-[32px] border-2 border-dashed border-border/60 bg-card/50">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 text-primary/40 mb-6">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground">No active proposals</h3>
              <p className="mt-2 text-muted-foreground max-w-xs text-center">
                All workers are currently on their existing terms.
              </p>
            </div>
          )}
        </div>

        {expiredProposals.length > 0 && (
          <div className="space-y-4 pt-10">
            <div className="flex items-center gap-3 px-1">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold uppercase tracking-widest text-destructive">Expired — Awaiting Resolution</h2>
                <p className="text-[11px] text-muted-foreground/60 font-medium">These proposals have passed their review window. Call expireProposal() to resolve each one.</p>
              </div>
              <div className="h-px flex-1 bg-destructive/20" />
            </div>

            <div className="rounded-[24px] border border-destructive/20 bg-card overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-destructive/5">
                  <TableRow className="hover:bg-transparent border-b border-destructive/10">
                    <TableHead className="w-[250px] font-bold text-xs uppercase tracking-widest py-4 text-destructive/70">Worker</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest text-destructive/70">Proposed Terms</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest text-destructive/70">Expired</TableHead>
                    <TableHead className="font-bold text-xs uppercase tracking-widest text-destructive/70">Outcome</TableHead>
                    <TableHead className="w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpiredProposals.map((worker) => {
                    const proposal = worker.pendingProposal!
                    const isHighStakes = proposal.terminateOnReject

                    return (
                      <TableRow key={worker.address} className="border-b border-destructive/10 bg-destructive/[0.02]">
                        <TableCell className="py-5">
                          <div className="space-y-1.5">
                            <p className="font-mono text-sm font-bold text-destructive/80">
                              {worker.address.slice(0, 6)}...{worker.address.slice(-4)}
                            </p>
                            {isHighStakes && (
                              <Badge variant="destructive" className="text-[9px] h-4 px-1.5 font-bold uppercase tracking-wider">
                                Terminates on Reject
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium text-muted-foreground">
                            {formatRateDisplay({
                              timeline: proposal.timeline,
                              amountPerIntervalWei: proposal.amountPerIntervalWei,
                              intervalSeconds: proposal.intervalSeconds
                            })}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-destructive/70">
                            Expired {formatTimeExpired(proposal.expiryTimestamp, now)}
                          </p>
                        </TableCell>
                        <TableCell>
                          {isHighStakes ? (
                            <p className="text-xs font-bold text-destructive">Worker will be terminated</p>
                          ) : (
                            <p className="text-xs font-bold text-emerald-600">Accrual will resume</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            className={cn(
                              "rounded-xl h-8 px-4 font-bold text-xs uppercase tracking-wider",
                              isHighStakes ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"
                            )}
                            onClick={() => {
                              setSelectedWorker(worker)
                              setActiveModal("resolve")
                            }}
                          >
                            Resolve
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Modals */}
        <Dialog open={activeModal === "propose"} onOpenChange={(open) => !open && setActiveModal(null)}>
          <DialogContent className="max-w-md rounded-[28px]">
            <DialogHeader>
              <DialogTitle>Propose Terms</DialogTitle>
              <DialogDescription>
                Propose new payroll terms. Worker must accept or reject before the window expires.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 pt-4">
              {!selectedWorker && (
                <div className="space-y-2">
                  <Label>Worker Selection</Label>
                  <Select value={formWorkerAddress} onValueChange={setFormWorkerAddress}>
                    <SelectTrigger className="rounded-xl h-11">
                      <SelectValue placeholder="Select worker..." />
                    </SelectTrigger>
                    <SelectContent>
                      {workers
                        .filter(w => !w.pendingProposal)
                        .map(w => (
                          <SelectItem key={w.address} value={w.address}>
                            <div className="flex flex-col text-left">
                              <span className="font-bold">{w.name || w.address.slice(0, 6)}</span>
                              <span className="text-[10px] font-mono opacity-60">{w.address}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Proposed Timeline</Label>
                <Select value={formTimeline} onValueChange={setFormTimeline}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Select timeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMELINE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formTimeline !== "3" && (
                <div className="space-y-2">
                  <Label>Proposed Rate (ETH)</Label>
                  <Input 
                    value={formAmount} 
                    onChange={(e) => setFormAmount(e.target.value)} 
                    type="number" 
                    placeholder="0.0" 
                    className="font-mono rounded-xl h-11" 
                  />
                </div>
              )}

              {formTimeline === "2" && (
                <div className="space-y-2">
                  <Label>Custom Interval Seconds</Label>
                  <Input 
                    value={formInterval} 
                    onChange={(e) => setFormInterval(e.target.value)} 
                    type="number" 
                    placeholder="43200" 
                    className="font-mono rounded-xl h-11" 
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Note to worker (optional)</Label>
                <Textarea 
                  value={formProposalNote} 
                  onChange={(e) => setFormProposalNote(e.target.value)} 
                  placeholder="Explain the reason for this proposal, include any relevant links..." 
                  className="rounded-xl resize-none h-24"
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-destructive/20 bg-destructive/[0.03]">
                <div className="space-y-0.5 max-w-[80%]">
                  <Label className="text-destructive font-bold cursor-pointer" htmlFor="terminate-toggle">
                    Terminate on Reject
                  </Label>
                  <p className="text-[10px] text-destructive/70 font-medium leading-tight">
                    If worker rejects or proposal expires, they will be permanently terminated.
                  </p>
                </div>
                <Switch 
                  id="terminate-toggle"
                  checked={formTerminateOnReject} 
                  onCheckedChange={setFormTerminateOnReject} 
                />
              </div>

              <div className="p-4 rounded-2xl border border-primary/20 bg-primary/[0.03] space-y-2">
                <div className="flex justify-between items-baseline">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60">Summary</p>
                  <p className="text-[10px] font-medium text-primary/60 italic">Review window: {formatDuration(stats.reviewWindow)}</p>
                </div>
                <p className="text-[10px] text-primary/60">
                  Proposal expires: {new Date(Number(now + stats.reviewWindow) * 1000).toLocaleString()}
                </p>
              </div>

              <Button
                className="w-full h-12 rounded-xl font-bold text-base shadow-sm"
                disabled={isWalletPending || (!selectedWorker && !formWorkerAddress)}
                onClick={() => executeWrite("Propose terms", async () => {
                  const targetAddr = selectedWorker?.address || (formWorkerAddress as Address)
                  if (!isAddress(targetAddr)) throw new Error("Invalid worker address")
                  if (!contract) throw new Error("Contract not configured")
                  
                  const timeline = Number(formTimeline)
                  const amountWei = formTimeline === "3" ? 0n : parseEthOrThrow(formAmount, "Proposed rate")
                  const interval = formTimeline === "2" ? BigInt(formInterval || "0") : 0n
                  
                  return writeContractAsync({
                    ...contract,
                    functionName: "proposeTerms",
                    args: [getAddress(targetAddr), timeline, amountWei, interval, formTerminateOnReject, formProposalNote.trim()],
                  })
                })}
              >
                Send Proposal
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={activeModal === "edit-window"} onOpenChange={(open) => !open && setActiveModal(null)}>
          <DialogContent className="max-w-sm rounded-[28px]">
            <DialogHeader>
              <DialogTitle>Edit Review Window</DialogTitle>
              <DialogDescription>Set the default response window for new proposals.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 pt-4">
              <div className="space-y-2">
                <Label>Window Duration (Days)</Label>
                <Input 
                  value={formReviewWindowDays} 
                  onChange={(e) => setFormReviewWindowDays(e.target.value)} 
                  type="number" 
                  placeholder="7" 
                  className="font-mono rounded-xl h-11" 
                />
              </div>
              <Button
                className="w-full h-11 rounded-xl font-bold"
                disabled={isWalletPending}
                onClick={() => executeWrite("Update window", async () => {
                  if (!contract) throw new Error("Contract not configured")
                  const days = BigInt(formReviewWindowDays || "0")
                  return writeContractAsync({
                    ...contract,
                    functionName: "setProposalWindow",
                    args: [days * 86400n],
                  })
                })}
              >
                Update Window
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={activeModal === "cancel"} onOpenChange={(open) => !open && setActiveModal(null)}>
          <DialogContent className="max-w-sm rounded-[28px]">
            <DialogHeader>
              <DialogTitle>Cancel Proposal</DialogTitle>
              <DialogDescription>
                Cancelling this proposal will restore the worker to their previous terms and resume accrual. Are you sure?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-4">
              <Button
                variant="destructive"
                className="h-11 rounded-xl font-bold"
                disabled={isWalletPending}
                onClick={() => executeWrite("Cancel proposal", async () => {
                  if (!selectedWorker) throw new Error("No worker selected")
                  if (!contract) throw new Error("Contract not configured")
                  return writeContractAsync({
                    ...contract,
                    functionName: "cancelProposal",
                    args: [selectedWorker.address],
                  })
                })}
              >
                Confirm Cancellation
              </Button>
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setActiveModal(null)}>Keep Proposal</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={activeModal === "resolve"} onOpenChange={(open) => !open && setActiveModal(null)}>
          <DialogContent className="max-w-sm rounded-[28px]">
            <DialogHeader>
              <DialogTitle>Resolve Expired Proposal</DialogTitle>
              <DialogDescription>
                {selectedWorker?.pendingProposal?.terminateOnReject 
                  ? `This will permanently terminate ${selectedWorker?.address.slice(0,6)}...${selectedWorker?.address.slice(-4)}. This cannot be undone.`
                  : "This will expire the proposal and restore the worker to their original terms."
                }
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-4">
              <Button
                variant={selectedWorker?.pendingProposal?.terminateOnReject ? "destructive" : "default"}
                className="h-11 rounded-xl font-bold uppercase tracking-wider text-xs"
                disabled={isWalletPending}
                onClick={() => executeWrite("Resolve proposal", async () => {
                  if (!selectedWorker) throw new Error("No worker selected")
                  if (!contract) throw new Error("Contract not configured")
                  return writeContractAsync({
                    ...contract,
                    functionName: "expireProposal",
                    args: [selectedWorker.address],
                  })
                })}
              >
                {selectedWorker?.pendingProposal?.terminateOnReject ? "Confirm Termination" : "Confirm Resolution"}
              </Button>
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setActiveModal(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
