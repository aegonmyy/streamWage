"use client"

import { useState, useMemo, useEffect } from "react"
import { useAccount, useWaitForTransactionReceipt } from "wagmi"
import { parseEther, getAddress, isAddress, type Address } from "viem"
import { toast } from "sonner"
import { Info } from "lucide-react"

import { usePayrollAdminData, type AdminWorkerRecord, formatEth } from "@/hooks/use-payroll-admin-data"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { usePayrollWrite } from "@/hooks/use-payroll-write"
import { getPayrollContractConfig } from "@/lib/payroll-contract"
import { getTransactionToastDescription } from "@/lib/transaction-links"

import { WorkerStats } from "./worker-stats"
import { WorkerToolbar } from "./worker-toolbar"
import { WorkerTable } from "./worker-table"

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

export function WorkersView() {
  const contract = getPayrollContractConfig()
  const { data, isLoading, refetch } = usePayrollAdminData()
  
  // Search and Filter State
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [timelineFilter, setTimelineFilter] = useState("all")

  // Modal States
  const [activeModal, setActiveModal] = useState<string | null>(null)
  const [selectedWorker, setSelectedWorker] = useState<AdminWorkerRecord | null>(null)

  // Form States
  const [formAddress, setFormAddress] = useState("")
  const [formTimeline, setFormTimeline] = useState("0")
  const [formAmount, setFormAmount] = useState("")
  const [formInterval, setFormInterval] = useState("")
  const [formMetadata, setFormMetadata] = useState("")
  const [formProposalNote, setFormProposalNote] = useState("")
  const [formTerminateOnReject, setFormTerminateOnReject] = useState(false)

  const { writeContractAsync, data: hash, isPending: isWalletPending } = usePayrollWrite()
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) {
      refetch()
    }
  }, [receipt.isSuccess, refetch])

  // Data processing
  const workers = data?.workers ?? []
  const filteredWorkers = useMemo(() => {
    return workers.filter((worker) => {
      const matchesSearch = 
        worker.address.toLowerCase().includes(search.toLowerCase()) || 
        worker.metadata.toLowerCase().includes(search.toLowerCase()) ||
        worker.name.toLowerCase().includes(search.toLowerCase())
      
      const matchesStatus = 
        filter === "all" ||
        (filter === "active" && worker.status === "active") ||
        (filter === "paused" && worker.status === "paused") ||
        (filter === "low-runway" && worker.status === "active" && worker.runwaySeconds < (data?.lowTreasuryThresholdSeconds ?? 0n)) ||
        (filter === "trigger" && worker.timeline === "Trigger")
      
      const matchesTimeline = 
        timelineFilter === "all" || 
        worker.timeline === timelineFilter
      
      return matchesSearch && matchesStatus && matchesTimeline
    })
  }, [workers, search, filter, timelineFilter, data?.lowTreasuryThresholdSeconds])

  // Stats calculation
  const stats = useMemo(() => {
    const total = workers.length
    const active = workers.filter(w => w.status === "active" && w.timeline !== "Trigger").length
    const activeTrigger = workers.filter(w => w.status === "active" && w.timeline === "Trigger").length
    const paused = workers.filter(w => w.status === "paused").length
    const pausedByProposal = workers.filter(w => w.status === "paused" && w.pendingProposal).length
    const totalClaimable = workers.reduce((acc, w) => acc + w.claimableWei, 0n)
    
    return { total, active, activeTrigger, paused, pausedByProposal, totalClaimable }
  }, [workers])

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

  const handleAction = (action: string, worker: AdminWorkerRecord) => {
    setSelectedWorker(worker)
    if (action === "add") {
      setFormAddress("")
      setFormTimeline("0")
      setFormAmount("")
      setFormInterval("")
      setFormMetadata("")
      setActiveModal("add")
    } else if (action === "adjust-rate") {
      setFormAmount("")
      setActiveModal("adjust-rate")
    } else if (action === "propose-terms") {
      setFormTimeline(worker.timeline === "Hourly" ? "0" : worker.timeline === "Monthly" ? "1" : worker.timeline === "Custom" ? "2" : "3")
      setFormAmount("")
      setFormInterval("")
      setFormProposalNote("")
      setFormTerminateOnReject(false)
      setActiveModal("propose-terms")
    } else if (action === "pause") {
      setActiveModal("pause")
    } else if (action === "resume") {
      setActiveModal("resume")
    } else if (action === "grant-payment") {
      setFormAmount("")
      setActiveModal("grant-payment")
    } else if (action === "cancel-proposal") {
      setActiveModal("cancel-proposal")
    } else if (action === "view-migration") {
      setActiveModal("view-migration")
    }
  }

  function parseEthOrThrow(value: string, label: string) {
    if (!value.trim()) throw new Error(`${label} is required.`)
    return parseEther(value.trim())
  }

  return (
    <div className="space-y-10">
      <WorkerStats 
        totalWorkers={stats.total}
        activeWorkers={stats.active}
        triggerWorkers={stats.activeTrigger}
        pausedWorkers={stats.paused}
        pausedByProposal={stats.pausedByProposal}
        totalClaimableWei={stats.totalClaimable}
        treasuryBalanceWei={data?.treasuryBalanceWei ?? 0n}
      />

      <div className="space-y-6">
        <WorkerToolbar 
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          timelineFilter={timelineFilter}
          setTimelineFilter={setTimelineFilter}
          onAddWorker={() => handleAction("add", {} as any)}
        />

        <WorkerTable 
          workers={filteredWorkers}
          lowTreasuryThresholdSeconds={data?.lowTreasuryThresholdSeconds ?? 0n}
          treasuryBalanceWei={data?.treasuryBalanceWei ?? 0n}
          onAction={handleAction}
          isLoading={isLoading}
        />
      </div>

      {/* Modals */}
      <Dialog open={activeModal === "add"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-md rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Add Worker</DialogTitle>
            <DialogDescription>Register a new worker payroll profile under operator control.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            <div className="space-y-2">
              <Label>Wallet Address</Label>
              <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="0x..." className="font-mono rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Timeline</Label>
              <Select value={formTimeline} onValueChange={setFormTimeline}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select timeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Hourly</SelectItem>
                  <SelectItem value="1">Monthly</SelectItem>
                  <SelectItem value="2">Custom Interval</SelectItem>
                  <SelectItem value="3">Trigger-based</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formTimeline !== "3" && (
              <div className="space-y-2">
                <Label>Amount per Interval (ETH)</Label>
                <Input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} type="number" placeholder="0.0" className="font-mono rounded-xl" />
              </div>
            )}
            {formTimeline === "2" && (
              <div className="space-y-2">
                <Label>Custom Interval Seconds</Label>
                <Input value={formInterval} onChange={(e) => setFormInterval(e.target.value)} type="number" placeholder="43200" className="font-mono rounded-xl" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Metadata</Label>
              <Input value={formMetadata} onChange={(e) => setFormMetadata(e.target.value)} placeholder="Alice Chen | Engineering" className="rounded-xl" />
            </div>
            <Button
              className="w-full h-11 rounded-xl font-bold"
              disabled={isWalletPending}
              onClick={() => executeWrite("Add worker", async () => {
                if (!isAddress(formAddress)) throw new Error("Invalid worker address")
                if (!contract) throw new Error("Contract not configured")
                return writeContractAsync({
                  ...contract,
                  functionName: "addWorker",
                  args: [
                    getAddress(formAddress), 
                    Number(formTimeline), 
                    formTimeline === "3" ? 0n : parseEther(formAmount || "0"), 
                    formTimeline === "2" ? BigInt(formInterval || "0") : 0n, 
                    formMetadata.trim()
                  ],
                })
              })}
            >
              Create Worker Record
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeModal === "adjust-rate"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-md rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Adjust Rate</DialogTitle>
            <DialogDescription>Update the interval amount for {selectedWorker?.name || (selectedWorker?.address ? `${selectedWorker.address.slice(0,6)}...` : 'worker')}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            <div className="p-4 rounded-2xl bg-muted/50 border border-border/40">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Current Rate</p>
              <p className="text-lg font-bold">{selectedWorker ? `${formatEth(selectedWorker.amountPerIntervalWei)} ETH / ${selectedWorker.timeline}` : "—"}</p>
            </div>
            <div className="space-y-2">
              <Label>New Rate (ETH)</Label>
              <Input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} type="number" placeholder="0.0" className="font-mono rounded-xl" />
            </div>
            <Button
              className="w-full h-11 rounded-xl font-bold"
              disabled={isWalletPending}
              onClick={() => executeWrite("Update rate", async () => {
                if (!selectedWorker) throw new Error("No worker selected")
                if (!contract) throw new Error("Contract not configured")
                return writeContractAsync({
                  ...contract,
                  functionName: "updateWorkerRate",
                  args: [selectedWorker.address, parseEther(formAmount || "0")],
                })
              })}
            >
              Update Rate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeModal === "propose-terms"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-md rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Propose Terms</DialogTitle>
            <DialogDescription>Propose new payroll terms for {selectedWorker?.name || (selectedWorker?.address ? `${selectedWorker.address.slice(0,6)}...` : 'worker')}. Worker must accept or reject.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            <div className="space-y-2">
              <Label>Timeline</Label>
              <Select value={formTimeline} onValueChange={setFormTimeline}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select timeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Hourly</SelectItem>
                  <SelectItem value="1">Monthly</SelectItem>
                  <SelectItem value="2">Custom Interval</SelectItem>
                  <SelectItem value="3">Trigger-based</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount per Interval (ETH)</Label>
              <Input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} type="number" placeholder="0.0" className="font-mono rounded-xl" />
            </div>
            {formTimeline === "2" && (
              <div className="space-y-2">
                <Label>Custom Interval Seconds</Label>
                <Input value={formInterval} onChange={(e) => setFormInterval(e.target.value)} type="number" placeholder="43200" className="font-mono rounded-xl" />
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
            <div className="flex items-center justify-between p-4 rounded-2xl border border-destructive/20 bg-destructive/5">
              <div className="space-y-0.5">
                <Label className="text-destructive font-bold">Terminate on Reject</Label>
                <p className="text-[10px] text-destructive/70 font-medium leading-tight">If worker rejects, they will be permanently terminated.</p>
              </div>
              <Switch checked={formTerminateOnReject} onCheckedChange={setFormTerminateOnReject} />
            </div>
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 flex gap-2 items-start">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-600 font-medium">Worker has {data ? Math.floor(Number(data.defaultProposalWindowSeconds) / 86400) : "X"} days to respond before proposal expires.</p>
            </div>
            <Button
              className="w-full h-11 rounded-xl font-bold"
              disabled={isWalletPending}
              onClick={() => executeWrite("Propose terms", async () => {
                if (!selectedWorker) throw new Error("No worker selected")
                if (!contract) throw new Error("Contract not configured")
                return writeContractAsync({
                  ...contract,
                  functionName: "proposeTerms",
                  args: [
                    selectedWorker.address, 
                    Number(formTimeline), 
                    parseEther(formAmount || "0"), 
                    formTimeline === "2" ? BigInt(formInterval || "0") : 0n, 
                    formTerminateOnReject,
                    formProposalNote.trim()
                  ],
                })
              })}
            >
              Propose New Terms
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeModal === "grant-payment"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-md rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Grant Trigger Payment</DialogTitle>
            <DialogDescription>Issue a one-time payment to {selectedWorker?.name || (selectedWorker?.address ? `${selectedWorker.address.slice(0,6)}...` : 'worker')}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            <div className="p-4 rounded-2xl bg-muted/50 border border-border/40">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Recipient</p>
              <p className="font-mono text-sm font-bold truncate">{selectedWorker?.address}</p>
            </div>
            <div className="space-y-2">
              <Label>Amount (ETH)</Label>
              <Input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} type="number" placeholder="0.0" className="font-mono rounded-xl" />
            </div>
            <Button
              className="w-full h-11 rounded-xl font-bold"
              disabled={isWalletPending}
              onClick={() => executeWrite("Grant payment", async () => {
                if (!selectedWorker) throw new Error("No worker selected")
                if (!contract) throw new Error("Contract not configured")
                return writeContractAsync({
                  ...contract,
                  functionName: "grantTriggerPayment",
                  args: [selectedWorker.address, parseEther(formAmount || "0")],
                })
              })}
            >
              Issue Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeModal === "pause" || activeModal === "resume"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-sm rounded-[28px]">
          <DialogHeader>
            <DialogTitle>{activeModal === "pause" ? "Pause Worker" : "Resume Worker"}</DialogTitle>
            <DialogDescription>
              {activeModal === "pause" 
                ? `Confirm pausing all ETH accrual for ${selectedWorker?.name || (selectedWorker?.address ? `${selectedWorker.address.slice(0,6)}...` : 'worker')}.` 
                : `Confirm resuming ETH accrual for ${selectedWorker?.name || (selectedWorker?.address ? `${selectedWorker.address.slice(0,6)}...` : 'worker')}.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Button
              variant={activeModal === "pause" ? "destructive" : "default"}
              className="h-11 rounded-xl font-bold"
              disabled={isWalletPending}
              onClick={() => executeWrite(activeModal === "pause" ? "Pause worker" : "Resume worker", async () => {
                if (!selectedWorker) throw new Error("No worker selected")
                if (!contract) throw new Error("Contract not configured")
                return writeContractAsync({
                  ...contract,
                  functionName: "setWorkerStatus",
                  args: [selectedWorker.address, activeModal === "resume"],
                })
              })}
            >
              {activeModal === "pause" ? "Confirm Pause" : "Confirm Resume"}
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setActiveModal(null)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeModal === "cancel-proposal"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-sm rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Cancel Proposal</DialogTitle>
            <DialogDescription>Are you sure you want to cancel the pending proposal for {selectedWorker?.name || (selectedWorker?.address ? `${selectedWorker.address.slice(0,6)}...` : 'worker')}?</DialogDescription>
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

      <Dialog open={activeModal === "view-migration"} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-md rounded-[28px]">
          <DialogHeader>
            <DialogTitle>Pending Migration</DialogTitle>
            <DialogDescription>A migration has been proposed for {selectedWorker?.name || (selectedWorker?.address ? `${selectedWorker.address.slice(0,6)}...` : 'worker')}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-1">Proposed New Address</p>
              <p className="font-mono text-sm font-bold truncate text-blue-700">{selectedWorker?.pendingMigration?.newAddress}</p>
            </div>
            <div className="flex flex-col gap-3">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setActiveModal(null)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
