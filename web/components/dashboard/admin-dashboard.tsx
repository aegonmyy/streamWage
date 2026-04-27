"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  Clock3,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Shield,
  TrendingDown,
  Wallet,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import { formatEther, getAddress, isAddress, parseEther, type Address } from "viem"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  formatDuration,
  formatEth,
  formatRate,
  formatTimeline,
  formatWeiRatePerDay,
  usePayrollAdminData,
  type AdminWorkerRecord,
  type PayrollTimeline,
} from "@/hooks/use-payroll-admin-data"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { getPayrollContractConfig } from "@/lib/payroll-contract"
import { getTransactionToastDescription } from "@/lib/transaction-links"
import { cn } from "@/lib/utils"

type AdminSectionId = "overview" | "workers" | "proposals" | "treasury" | "admins"

const SIDEBAR_SECTIONS: Array<{
  id: AdminSectionId
  label: string
  eyebrow: string
  description: string
}> = [
  { id: "overview", label: "Overview", eyebrow: "Command", description: "Treasury health, headcount, and urgent operator tasks." },
  { id: "workers", label: "Workers", eyebrow: "Roster", description: "Add workers, adjust terms, and manage active status." },
  { id: "proposals", label: "Proposals", eyebrow: "Review Queue", description: "Track pending term changes that pause accrual until resolved." },
  { id: "treasury", label: "Treasury", eyebrow: "Capital", description: "Fund payroll, monitor runway, and manage safe withdrawals." },
  { id: "admins", label: "Admins", eyebrow: "Permissions", description: "Owner and operator access controls for the protocol." },
]

const TIMELINE_OPTIONS = [
  { label: "Hourly", value: "0" },
  { label: "Monthly", value: "1" },
  { label: "Custom Interval", value: "2" },
  { label: "Trigger-based", value: "3" },
] as const

function parseEthOrThrow(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} is required.`)
  return parseEther(value.trim())
}

function toAddressOrThrow(value: string, label: string): Address {
  if (!isAddress(value.trim())) throw new Error(`${label} must be a valid address.`)
  return getAddress(value.trim())
}

function humanExpiry(expiryTimestamp: bigint) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (expiryTimestamp <= now) return "expired"
  return `in ${formatDuration(expiryTimestamp - now)}`
}

function StatCard({
  title,
  value,
  hint,
  danger = false,
}: {
  title: string
  value: string
  hint: string
  danger?: boolean
}) {
  return (
    <Card className={cn(danger && "border-destructive/40 bg-destructive/5")}>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export function AdminDashboard() {
  const contract = getPayrollContractConfig()
  const { address: connectedAddress } = useAccount()
  const { contractAddress, chainId, isConfigured } = usePayrollRole()
  const { data, isLoading, isError, error, refetch } = usePayrollAdminData()
  const [section, setSection] = useState<AdminSectionId>("overview")

  const [isFundingOpen, setIsFundingOpen] = useState(false)
  const [fundAmount, setFundAmount] = useState("")

  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false)
  const [newWorkerAddress, setNewWorkerAddress] = useState("")
  const [newWorkerTimeline, setNewWorkerTimeline] = useState("0")
  const [newWorkerAmount, setNewWorkerAmount] = useState("")
  const [newWorkerIntervalSeconds, setNewWorkerIntervalSeconds] = useState("")
  const [newWorkerMetadata, setNewWorkerMetadata] = useState("")

  const [triggerWorker, setTriggerWorker] = useState<Address | null>(null)
  const [triggerAmount, setTriggerAmount] = useState("")

  const [withdrawRecipient, setWithdrawRecipient] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [thresholdDays, setThresholdDays] = useState("")

  const [adminAddress, setAdminAddress] = useState("")
  const [ownershipAddress, setOwnershipAddress] = useState("")

  const { writeContractAsync, data: hash, isPending: isWalletPending } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash })

  const selectedSection = SIDEBAR_SECTIONS.find((item) => item.id === section) ?? SIDEBAR_SECTIONS[0]
  const workers = data?.workers ?? []
  const activeWorkers = workers.filter((worker) => worker.status === "active")
  const pendingProposals = workers.filter((worker) => worker.pendingProposal)
  const owner = data?.owner
  const isOwner = !!owner && !!connectedAddress && getAddress(owner) === getAddress(connectedAddress)
  const treasuryBalanceWei = data?.treasuryBalanceWei ?? 0n
  const lowTreasuryThresholdSeconds = data?.lowTreasuryThresholdSeconds ?? 0n
  const runwaySeconds = data?.runwaySeconds ?? 0n
  const totalRatePerSecondWei = data?.totalRatePerSecondWei ?? 0n
  const isLowTreasury = lowTreasuryThresholdSeconds > 0n && runwaySeconds < lowTreasuryThresholdSeconds

  const safeWithdrawableWei = useMemo(() => {
    if (!data) return 0n
    const reserve = data.totalRatePerSecondWei * 3_600n
    return data.treasuryBalanceWei > reserve ? data.treasuryBalanceWei - reserve : 0n
  }, [data])

  async function executeWrite(
    actionLabel: string,
    callback: () => Promise<`0x${string}`>,
    onSuccess?: () => void,
  ) {
    try {
      const nextHash = await callback()
      toast.success(`${actionLabel} submitted`, {
        description: getTransactionToastDescription(contract?.chainId, nextHash),
      })
      onSuccess?.()
      await refetch()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Transaction failed."
      toast.error(actionLabel, { description: message })
    }
  }

  if (!contract) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground sm:px-6">
        Configure `NEXT_PUBLIC_PAYROLL_CONTRACT_ADDRESS` and `NEXT_PUBLIC_PAYROLL_CHAIN_ID` to enable the admin dashboard.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground sm:px-6">
        Loading payroll state from chain…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-16 sm:px-6">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load payroll state."}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const priorityCards = [
    {
      title: "Runway Watch",
      value: formatDuration(runwaySeconds),
      hint: "Treasury and runway update from live onchain reads and contract event subscriptions.",
      icon: TrendingDown,
      target: "treasury" as const,
    },
    {
      title: "Paused By Proposal",
      value: `${pendingProposals.length} workers`,
      hint: "Pending terms pause accrual until the worker accepts, rejects, or the proposal expires.",
      icon: Clock3,
      target: "proposals" as const,
    },
    {
      title: "Access Surface",
      value: `${data.admins.length + 1} privileged wallets`,
      hint: "Owner and enabled admins are indexed from OwnerTransferred and AdminUpdated events.",
      icon: Shield,
      target: "admins" as const,
    },
  ]

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Treasury Balance"
          value={`${formatEth(treasuryBalanceWei)} ETH`}
          hint={`Current payroll drain is ${formatWeiRatePerDay(totalRatePerSecondWei)}.`}
          danger={isLowTreasury}
        />
        <StatCard
          title="Runway"
          value={formatDuration(runwaySeconds)}
          hint={`Low treasury threshold is ${formatDuration(lowTreasuryThresholdSeconds)}.`}
        />
        <StatCard
          title="Active Workers"
          value={`${activeWorkers.length}`}
          hint={`${workers.length} worker records currently indexed from contract events.`}
        />
        <StatCard
          title="Pending Proposals"
          value={`${pendingProposals.length}`}
          hint="Pending proposals are read directly from the contract mapping per worker."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Priority Queue</CardTitle>
            <CardDescription>Use this as the operator start screen instead of chasing isolated contract methods.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {priorityCards.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setSection(item.target)}
                  className="flex w-full items-start justify-between rounded-2xl border border-border/70 bg-card px-4 py-4 text-left transition hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">{item.value}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.hint}</p>
                    </div>
                  </div>
                  <MoreHorizontal className="mt-1 h-4 w-4 text-muted-foreground" />
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card className={cn(isLowTreasury && "border-destructive/40")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isLowTreasury ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <BadgeCheck className="h-5 w-5 text-primary" />}
              Live Status
            </CardTitle>
            <CardDescription>
              Worker, treasury, ownership, and proposal state are refreshed from contract events plus fresh reads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              The dashboard subscribes to payroll contract logs and invalidates the admin query set whenever a relevant event lands.
            </p>
            <p>
              Event indexing starts at block <span className="font-mono">{contract.fromBlock.toString()}</span>. Set `NEXT_PUBLIC_PAYROLL_FROM_BLOCK` in production.
            </p>
            <p className="font-mono text-xs">
              {isConfigured
                ? `Role gate targets ${contractAddress} on chain ${chainId}.`
                : "Contract not configured."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderWorkers = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-card p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Worker operations</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The roster is built from `WorkerAdded` and `MigrationCompleted` events, then hydrated with live worker state.
          </p>
        </div>
        <Dialog open={isAddWorkerOpen} onOpenChange={setIsAddWorkerOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              Add Worker
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Worker</DialogTitle>
              <DialogDescription>Register a new worker payroll profile under operator control.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Wallet Address</label>
                <Input value={newWorkerAddress} onChange={(event) => setNewWorkerAddress(event.target.value)} placeholder="0x..." className="font-mono" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Timeline</label>
                <Select value={newWorkerTimeline} onValueChange={setNewWorkerTimeline}>
                  <SelectTrigger>
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
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount per Interval (ETH)</label>
                <Input value={newWorkerAmount} onChange={(event) => setNewWorkerAmount(event.target.value)} type="number" placeholder="0.0" className="font-mono" />
              </div>
              {newWorkerTimeline === "2" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom Interval Seconds</label>
                  <Input
                    value={newWorkerIntervalSeconds}
                    onChange={(event) => setNewWorkerIntervalSeconds(event.target.value)}
                    type="number"
                    placeholder="43200"
                    className="font-mono"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <label className="text-sm font-medium">Metadata</label>
                <Input value={newWorkerMetadata} onChange={(event) => setNewWorkerMetadata(event.target.value)} placeholder="Alice Chen | Engineering" />
              </div>
              <Button
                className="w-full"
                disabled={isWalletPending}
                onClick={() =>
                  void executeWrite("Add worker", async () => {
                    const workerAddr = toAddressOrThrow(newWorkerAddress, "Worker address")
                    const timeline = Number(newWorkerTimeline)
                    const amountPerIntervalWei = timeline === 3 ? 0n : parseEthOrThrow(newWorkerAmount, "Amount per interval")
                    const customIntervalSeconds = timeline === 2 ? BigInt(newWorkerIntervalSeconds || "0") : 0n

                    return writeContractAsync({
                      ...contract,
                      functionName: "addWorker",
                      args: [workerAddr, timeline, amountPerIntervalWei, customIntervalSeconds, newWorkerMetadata.trim()],
                    })
                  }, () => {
                    setIsAddWorkerOpen(false)
                    setNewWorkerAddress("")
                    setNewWorkerTimeline("0")
                    setNewWorkerAmount("")
                    setNewWorkerIntervalSeconds("")
                    setNewWorkerMetadata("")
                  })
                }
              >
                Create Worker Record
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>Primary row actions are wired to the payroll contract.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 font-medium text-muted-foreground">Worker</th>
                <th className="pb-3 font-medium text-muted-foreground">Timeline</th>
                <th className="pb-3 font-medium text-muted-foreground">Rate</th>
                <th className="pb-3 font-medium text-muted-foreground">Claimable</th>
                <th className="pb-3 font-medium text-muted-foreground">Status</th>
                <th className="pb-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.address} className="border-b border-border last:border-0">
                  <td className="py-4">
                    <div>
                      <p className="font-medium text-foreground">{worker.name}</p>
                      <p className="text-sm text-muted-foreground">{worker.role}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{worker.address}</p>
                    </div>
                  </td>
                  <td className="py-4">{formatTimeline(worker)}</td>
                  <td className="py-4 font-mono text-sm">{formatRate(worker)}</td>
                  <td className="py-4 font-mono">{formatEth(worker.claimableWei)} ETH</td>
                  <td className="py-4">
                    <Badge variant={worker.status === "active" ? "default" : "secondary"} className="rounded-full px-2.5 py-1">
                      {worker.status === "active" ? "Active" : "Paused"}
                    </Badge>
                  </td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      {worker.timeline === "Trigger" ? (
                        <Dialog
                          open={triggerWorker === worker.address}
                          onOpenChange={(open) => {
                            setTriggerWorker(open ? worker.address : null)
                            if (!open) setTriggerAmount("")
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                              <Zap className="h-3.5 w-3.5" />
                              Grant Trigger
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Grant Trigger Payment</DialogTitle>
                              <DialogDescription>Grant a one-time payment to {worker.name}.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Amount (ETH)</label>
                                <Input value={triggerAmount} onChange={(event) => setTriggerAmount(event.target.value)} type="number" placeholder="0.0" className="font-mono" />
                              </div>
                              <Button
                                className="w-full"
                                disabled={isWalletPending}
                                onClick={() =>
                                  void executeWrite("Grant trigger payment", async () => {
                                    const amountWei = parseEthOrThrow(triggerAmount, "Trigger amount")
                                    return writeContractAsync({
                                      ...contract,
                                      functionName: "grantTriggerPayment",
                                      args: [worker.address, amountWei],
                                    })
                                  }, () => {
                                    setTriggerWorker(null)
                                    setTriggerAmount("")
                                  })
                                }
                              >
                                Grant Payment
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        disabled={isWalletPending}
                        onClick={() =>
                          void executeWrite(worker.status === "active" ? "Pause worker" : "Activate worker", async () =>
                            writeContractAsync({
                              ...contract,
                              functionName: "setWorkerStatus",
                              args: [worker.address, worker.status !== "active"],
                            }),
                          )
                        }
                      >
                        {worker.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      {worker.pendingProposal ? (
                        <Badge variant="secondary" className="rounded-full">
                          Pending proposal
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )

  const renderProposals = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Pending proposals"
          value={`${pendingProposals.length}`}
          hint="Each pending proposal pauses worker accrual."
        />
        <StatCard
          title="Termination on reject"
          value={`${pendingProposals.filter((item) => item.pendingProposal?.terminateOnReject).length}`}
          hint="These can terminate the worker on rejection or expiry."
        />
        <StatCard
          title="Review window"
          value={formatDuration(data.defaultProposalWindowSeconds)}
          hint="Current default proposal window from the contract."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proposal queue</CardTitle>
          <CardDescription>These are live reads from `pendingTerms(worker)` across the indexed worker set.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingProposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending proposals.</p>
          ) : (
            pendingProposals.map((worker) => {
              const proposal = worker.pendingProposal!
              return (
                <div
                  key={worker.address}
                  className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card px-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{worker.name}</p>
                      {proposal.terminateOnReject ? (
                        <Badge variant="destructive" className="rounded-full">Terminate on reject</Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-full">Resume on reject</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatRate({
                        timeline: proposal.timeline,
                        amountPerIntervalWei: proposal.amountPerIntervalWei,
                        intervalSeconds: proposal.intervalSeconds,
                      })}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{worker.address}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full">Expires {humanExpiry(proposal.expiryTimestamp)}</Badge>
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={isWalletPending}
                      onClick={() =>
                        void executeWrite("Cancel proposal", async () =>
                          writeContractAsync({
                            ...contract,
                            functionName: "cancelProposal",
                            args: [worker.address],
                          }),
                        )
                      }
                    >
                      Cancel Proposal
                    </Button>
                    <Button
                      className="rounded-xl"
                      disabled={isWalletPending}
                      onClick={() =>
                        void executeWrite("Expire proposal", async () =>
                          writeContractAsync({
                            ...contract,
                            functionName: "expireProposal",
                            args: [worker.address],
                          }),
                        )
                      }
                    >
                      Expire If Eligible
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderTreasury = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Balance" value={`${formatEth(treasuryBalanceWei)} ETH`} hint="Current treasury balance available to satisfy claims." danger={isLowTreasury} />
        <StatCard title="Runway" value={formatDuration(runwaySeconds)} hint="Estimated from `treasuryRunway()`." />
        <StatCard title="Drain rate" value={formatWeiRatePerDay(totalRatePerSecondWei)} hint="Aggregate active payroll drain." />
        <StatCard title="Safe withdrawable" value={`${formatEth(safeWithdrawableWei)} ETH`} hint="Computed using the contract's one-hour reserve rule." />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fund treasury</CardTitle>
            <CardDescription>Send ETH through the contract’s `fundTreasury()` path.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Dialog open={isFundingOpen} onOpenChange={setIsFundingOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 rounded-xl">
                  <Wallet className="h-4 w-4" />
                  Fund Treasury
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Fund Treasury</DialogTitle>
                  <DialogDescription>Add ETH to the payroll treasury.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount (ETH)</label>
                    <Input value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} type="number" placeholder="0.0" className="font-mono" />
                  </div>
                  <p className="text-sm text-muted-foreground">Current balance: {formatEth(treasuryBalanceWei)} ETH</p>
                  <Button
                    className="w-full"
                    disabled={isWalletPending}
                    onClick={() =>
                      void executeWrite("Fund treasury", async () =>
                        writeContractAsync({
                          ...contract,
                          functionName: "fundTreasury",
                          args: [],
                          value: parseEthOrThrow(fundAmount, "Funding amount"),
                        }), () => {
                          setIsFundingOpen(false)
                          setFundAmount("")
                        })
                    }
                  >
                    Submit Funding Transaction
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <p className="text-sm text-muted-foreground">
              The treasury section updates when `TreasuryFunded`, `Claimed`, `ExcessWithdrawn`, or payroll state-change events land.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Treasury controls</CardTitle>
            <CardDescription>Routine operator actions and owner-only treasury thresholds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-sm font-medium text-foreground">Withdraw excess</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pull only the amount above the enforced one-hour reserve buffer.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input value={withdrawRecipient} onChange={(event) => setWithdrawRecipient(event.target.value)} placeholder="Recipient address" className="font-mono" />
                <Input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="0.0 ETH" type="number" className="font-mono" />
              </div>
              <Button
                variant="outline"
                className="mt-3 rounded-xl"
                disabled={isWalletPending}
                onClick={() =>
                  void executeWrite("Withdraw excess", async () => {
                    const recipient = toAddressOrThrow(withdrawRecipient || connectedAddress || "", "Recipient")
                    return writeContractAsync({
                      ...contract,
                      functionName: "withdrawExcess",
                      args: [recipient, parseEthOrThrow(withdrawAmount, "Withdraw amount")],
                    })
                  })
                }
              >
                Withdraw Excess
              </Button>
            </div>

            <div className="rounded-2xl border border-border/70 p-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Low treasury threshold</p>
                <Badge variant="secondary" className="rounded-full">Owner only</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Current warning threshold is {formatDuration(lowTreasuryThresholdSeconds)}.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <Input value={thresholdDays} onChange={(event) => setThresholdDays(event.target.value)} placeholder="7 days" type="number" className="font-mono" />
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={isWalletPending || !isOwner}
                  onClick={() =>
                    void executeWrite("Update threshold", async () =>
                      writeContractAsync({
                        ...contract,
                        functionName: "setLowTreasuryThreshold",
                        args: [BigInt(thresholdDays || "0") * 86_400n],
                      }),
                    )
                  }
                >
                  Update Threshold
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderAdmins = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Access control</CardTitle>
          <CardDescription>
            Ownership and admin lists are reconstructed from `OwnerTransferred` and `AdminUpdated` events, with owner verified via live read.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">Protocol Owner</p>
                <Badge className="rounded-full">Owner</Badge>
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{owner}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input value={ownershipAddress} onChange={(event) => setOwnershipAddress(event.target.value)} placeholder="New owner address" className="font-mono md:w-72" />
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={isWalletPending || !isOwner}
                onClick={() =>
                  void executeWrite("Transfer ownership", async () =>
                    writeContractAsync({
                      ...contract,
                      functionName: "transferOwnership",
                      args: [toAddressOrThrow(ownershipAddress, "New owner")],
                    }),
                  )
                }
              >
                Transfer Ownership
              </Button>
            </div>
          </div>

          {data.admins.map((admin) => (
            <div
              key={admin}
              className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">Enabled Admin</p>
                  <Badge variant="secondary" className="rounded-full">Operator</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{admin}</p>
              </div>
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={isWalletPending || !isOwner}
                onClick={() =>
                  void executeWrite("Remove admin", async () =>
                    writeContractAsync({
                      ...contract,
                      functionName: "setAdmin",
                      args: [admin, false],
                    }),
                  )
                }
              >
                Remove Admin
              </Button>
            </div>
          ))}

          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border/70 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-foreground">Add Admin</p>
              <p className="mt-1 text-sm text-muted-foreground">Owner-only write to `setAdmin(address, true)`.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input value={adminAddress} onChange={(event) => setAdminAddress(event.target.value)} placeholder="0x..." className="font-mono md:w-72" />
              <Button
                className="rounded-xl"
                disabled={isWalletPending || !isOwner}
                onClick={() =>
                  void executeWrite("Add admin", async () =>
                    writeContractAsync({
                      ...contract,
                      functionName: "setAdmin",
                      args: [toAddressOrThrow(adminAddress, "Admin address"), true],
                    }),
                  )
                }
              >
                Add Admin
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card">
            <div className="border-b border-border/70 px-5 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Admin Dashboard</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Live payroll operations backed by onchain reads, writes, and event subscriptions.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge className="rounded-full">Admin</Badge>
                <Badge variant="secondary" className="rounded-full">
                  {isOwner ? "Owner" : "Operator"}
                </Badge>
              </div>
            </div>

            <div className="space-y-1 p-3">
              {SIDEBAR_SECTIONS.map((item) => {
                const active = item.id === section
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "w-full rounded-2xl px-4 py-3 text-left transition",
                      active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted",
                    )}
                  >
                    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {item.eyebrow}
                    </p>
                    <p className="mt-1 text-sm font-semibold">{item.label}</p>
                    <p className={cn("mt-1 text-xs leading-5", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {item.description}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          <div className="rounded-[32px] border border-border/70 bg-card p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {selectedSection.eyebrow}
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {selectedSection.label}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{selectedSection.description}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Role Check</p>
                <p className="mt-1 text-sm text-foreground">
                  Access is resolved from <span className="font-mono text-xs">owner()</span> and <span className="font-mono text-xs">admins(address)</span>.
                </p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {isConfigured ? `${contractAddress} on chain ${chainId}` : "Contract not configured"}
                </p>
                {receipt.isSuccess ? (
                  <p className="mt-2 text-xs text-primary">Last transaction confirmed.</p>
                ) : null}
              </div>
            </div>
          </div>

          {section === "overview" ? renderOverview() : null}
          {section === "workers" ? renderWorkers() : null}
          {section === "proposals" ? renderProposals() : null}
          {section === "treasury" ? renderTreasury() : null}
          {section === "admins" ? renderAdmins() : null}
        </section>
      </div>
    </div>
  )
}
