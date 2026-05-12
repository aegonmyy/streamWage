"use client"

import * as React from "react"
import {
  MoreHorizontal,
  ArrowUpDown,
  AlertTriangle,
  Clock3,
  Pause,
  Play,
  Zap,
  Trash2,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatEth, formatDuration, type AdminWorkerRecord } from "@/hooks/use-payroll-admin-data"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface WorkerTableProps {
  workers: AdminWorkerRecord[]
  lowTreasuryThresholdSeconds: bigint
  treasuryBalanceWei: bigint
  onAction: (action: string, worker: AdminWorkerRecord) => void
  isLoading: boolean
}

export function WorkerTable({
  workers,
  lowTreasuryThresholdSeconds,
  treasuryBalanceWei,
  onAction,
  isLoading,
}: WorkerTableProps) {
  const [sortConfig, setSortSortConfig] = React.useState<{
    key: keyof AdminWorkerRecord | "runway" | "claimable"
    direction: "asc" | "desc"
  } | null>({ key: "runway", direction: "asc" })

  const sortedWorkers = React.useMemo(() => {
    let sortableItems = [...workers]
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any
        let bValue: any

        if (sortConfig.key === "runway") {
          // Special logic for runway sorting
          // Active first, then by runway ascending
          // Inactive/Trigger at bottom
          const aActive = a.status === "active" && a.timeline !== "Trigger"
          const bActive = b.status === "active" && b.timeline !== "Trigger"

          if (aActive && !bActive) return -1
          if (!aActive && bActive) return 1
          if (!aActive && !bActive) return 0

          aValue = a.runwaySeconds
          bValue = b.runwaySeconds
        } else if (sortConfig.key === "claimable") {
          aValue = a.claimableWei
          bValue = b.claimableWei
        } else {
          aValue = a[sortConfig.key as keyof AdminWorkerRecord]
          bValue = b[sortConfig.key as keyof AdminWorkerRecord]
        }

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1
        return 0
      })
    }
    return sortableItems
  }, [workers, sortConfig])

  const requestSort = (key: any) => {
    let direction: "asc" | "desc" = "asc"
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc"
    }
    setSortSortConfig({ key, direction })
  }

  if (isLoading) {
    return (
      <div className="rounded-[24px] border border-border/60 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border/60">
              <TableHead className="w-[280px]">Worker</TableHead>
              <TableHead>Timeline</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Claimable</TableHead>
              <TableHead>Runway</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i} className="animate-pulse border-b border-border/40">
                <TableCell><div className="h-10 w-40 bg-muted rounded-lg" /></TableCell>
                <TableCell><div className="h-6 w-20 bg-muted rounded-full" /></TableCell>
                <TableCell><div className="h-6 w-24 bg-muted rounded-lg" /></TableCell>
                <TableCell><div className="h-10 w-24 bg-muted rounded-lg" /></TableCell>
                <TableCell><div className="h-6 w-20 bg-muted rounded-lg" /></TableCell>
                <TableCell><div className="h-6 w-16 bg-muted rounded-full" /></TableCell>
                <TableCell><div className="h-8 w-8 bg-muted rounded-full" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (workers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 rounded-[32px] border-2 border-dashed border-border/60 bg-card/50">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 text-primary/40 mb-6">
          <Users className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-bold text-foreground">No workers registered</h3>
        <p className="mt-2 text-muted-foreground max-w-xs text-center">
          Add your first worker to start streaming payroll on-chain.
        </p>
        <Button onClick={() => onAction("add", {} as any)} className="mt-8 gap-2 rounded-xl h-11 px-6">
          <Plus className="h-4 w-4" />
          Add Worker
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-[24px] border border-border/60 bg-card overflow-hidden shadow-sm">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent border-b border-border/60">
            <TableHead className="w-[280px] font-bold text-xs uppercase tracking-widest py-4">Worker</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-widest">Timeline</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-widest">Rate</TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-widest cursor-pointer group" onClick={() => requestSort("claimable")}>
              <div className="flex items-center gap-1">
                Claimable <ArrowUpDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-widest cursor-pointer group" onClick={() => requestSort("runway")}>
              <div className="flex items-center gap-1">
                Runway <ArrowUpDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </TableHead>
            <TableHead className="font-bold text-xs uppercase tracking-widest">Status</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedWorkers.map((worker) => {
            const isLowRunway = worker.status === "active" && worker.timeline !== "Trigger" && worker.runwaySeconds < lowTreasuryThresholdSeconds
            const hasPendingProposal = !!worker.pendingProposal
            const hasPendingMigration = !!worker.pendingMigration
            const isInsufficientTreasury = worker.claimableWei > treasuryBalanceWei

            return (
              <TableRow
                key={worker.address}
                className={cn(
                  "group border-b border-border/40 transition-colors hover:bg-muted/20",
                  isLowRunway && "border-l-4 border-l-destructive/50",
                  hasPendingProposal && "border-l-4 border-l-amber-400/50"
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
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {hasPendingProposal && (
                        <Badge variant="outline" className="bg-amber-500/5 border-amber-500/20 text-amber-600 text-[10px] h-5 px-1.5 font-bold uppercase tracking-wide">
                          Proposal Pending
                        </Badge>
                      )}
                      {hasPendingMigration && (
                        <Badge variant="outline" className="bg-blue-500/5 border-blue-500/20 text-blue-600 text-[10px] h-5 px-1.5 font-bold uppercase tracking-wide">
                          Migration Pending
                        </Badge>
                      )}
                      {isLowRunway && (
                        <Badge variant="outline" className="bg-destructive/5 border-destructive/20 text-destructive text-[10px] h-5 px-1.5 font-bold uppercase tracking-wide">
                          Low Runway
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <Badge variant="secondary" className="rounded-md font-bold text-[10px] uppercase tracking-wider h-6">
                      {worker.timeline}
                    </Badge>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      {worker.timeline === "Hourly" && "Every 1 hour"}
                      {worker.timeline === "Monthly" && "Every 30 days"}
                      {worker.timeline === "Custom" && `Every ${formatDuration(worker.intervalSeconds)}`}
                      {worker.timeline === "Trigger" && "Manual grants only"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm font-bold text-foreground">
                    {worker.timeline === "Trigger" ? "—" : `${formatEth(worker.amountPerIntervalWei)} ETH`}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {worker.timeline === "Hourly" && "/ hour"}
                    {worker.timeline === "Monthly" && "/ 30d"}
                    {worker.timeline === "Custom" && `/ ${formatDuration(worker.intervalSeconds)}`}
                  </p>
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <p className={cn(
                        "text-sm font-bold",
                        isInsufficientTreasury && treasuryBalanceWei > 0n ? "text-amber-500" :
                          isInsufficientTreasury && treasuryBalanceWei === 0n ? "text-destructive" :
                            "text-foreground"
                      )}>
                        {isInsufficientTreasury ? formatEth(treasuryBalanceWei) : formatEth(worker.claimableWei)} ETH
                        {isInsufficientTreasury && treasuryBalanceWei > 0n && (
                          <span className="ml-1 text-[10px] font-bold uppercase tracking-tight opacity-80">(capped)</span>
                        )}
                      </p>
                      {isInsufficientTreasury && (
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertTriangle className={cn("h-3.5 w-3.5", treasuryBalanceWei === 0n ? "text-destructive" : "text-amber-500")} />
                          </TooltipTrigger>
                          <TooltipContent className="p-3 rounded-xl border-border/60 shadow-xl max-w-xs">
                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Treasury Cap</p>
                            <p className="text-sm font-medium leading-relaxed">
                              Theoretical claimable: <span className="font-bold">{formatEth(worker.claimableWei)} ETH</span>.
                              Treasury only covers <span className="font-bold">{formatEth(treasuryBalanceWei)} ETH</span>.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium leading-none">
                      Lifetime: <span className="text-foreground/70">{formatEth(worker.totalClaimedWei)} ETH</span>
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  {renderRunwayCell(worker)}
                </TableCell>
                <TableCell>
                  {renderStatusBadge(worker)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-muted">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[180px] rounded-xl shadow-lg">
                      <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Actions</DropdownMenuLabel>
                      {!worker.isTerminated && (
                        <>
                          <DropdownMenuItem className="text-sm font-medium focus:bg-primary/5" onClick={() => onAction("adjust-rate", worker)}>
                            Adjust Rate
                          </DropdownMenuItem>
                          {worker.timeline !== "Trigger" && (
                            <DropdownMenuItem className="text-sm font-medium focus:bg-primary/5" onClick={() => onAction("update-interval", worker)}>
                              Update Interval
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-sm font-medium focus:bg-primary/5" onClick={() => onAction("update-metadata", worker)}>
                            Edit Metadata
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-sm font-medium focus:bg-primary/5" onClick={() => onAction("propose-terms", worker)}>
                            Propose Terms
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {worker.status === "active" && !hasPendingProposal && (
                            <DropdownMenuItem className="text-sm font-medium text-amber-600 focus:bg-amber-500/5" onClick={() => onAction("pause", worker)}>
                              <Pause className="h-3.5 w-3.5 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          )}
                          {worker.status === "paused" && !hasPendingProposal && (
                            <DropdownMenuItem className="text-sm font-medium text-emerald-600 focus:bg-emerald-500/5" onClick={() => onAction("resume", worker)}>
                              <Play className="h-3.5 w-3.5 mr-2" />
                              Resume
                            </DropdownMenuItem>
                          )}
                          {worker.timeline === "Trigger" && worker.status === "active" && (
                            <DropdownMenuItem className="text-sm font-medium text-primary focus:bg-primary/5" onClick={() => onAction("grant-payment", worker)}>
                              <Zap className="h-3.5 w-3.5 mr-2" />
                              Grant Payment
                            </DropdownMenuItem>
                          )}
                          {hasPendingProposal && (
                            <DropdownMenuItem className="text-sm font-medium text-destructive focus:bg-destructive/5" onClick={() => onAction("cancel-proposal", worker)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Cancel Proposal
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      {hasPendingMigration && (
                        <DropdownMenuItem className="text-sm font-medium focus:bg-primary/5" onClick={() => onAction("view-migration", worker)}>
                          View Migration
                        </DropdownMenuItem>
                      )}
                      {worker.isTerminated && (
                        <DropdownMenuItem
                          className="text-sm font-medium text-emerald-600 focus:bg-emerald-500/5"
                          onClick={() => onAction("resume", worker)}
                        >
                          <Play className="h-3.5 w-3.5 mr-2" />
                          Reinstate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function renderRunwayCell(worker: AdminWorkerRecord) {
  if (worker.status === "terminated") {
    return <p className="text-sm font-medium text-destructive/60 italic">Terminated</p>
  }
  if (worker.status !== "active") {
    return <p className="text-sm font-medium text-muted-foreground/60 italic">Paused</p>
  }
  if (worker.timeline === "Trigger") {
    return <p className="text-sm font-medium text-muted-foreground/60">—</p>
  }

  const seconds = worker.runwaySeconds
  const day = 86_400n
  const hour = 3_600n
  const minute = 60n

  let color = "text-emerald-500"
  if (seconds < day * 7n) color = "text-destructive"
  else if (seconds < day * 30n) color = "text-amber-500"

  const content = (
    <>
      {seconds > day * 2n ? (
        <p className={cn("text-sm font-bold", color)}>{seconds / day} days</p>
      ) : seconds > hour * 1n ? (
        <p className={cn("text-sm font-bold", color)}>{seconds / hour}h {(seconds % hour) / minute}m</p>
      ) : (
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <p className="text-sm font-bold text-destructive">
            {seconds / minute} min
          </p>
        </div>
      )}
    </>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help inline-block">
          {content}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] p-3 rounded-xl border-border/60 shadow-xl">
        <p className="text-xs font-medium leading-relaxed">
          This represents how long the current balance can pay the existing time-base workers in the payroll.
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

function renderStatusBadge(worker: AdminWorkerRecord) {
  const hasPendingProposal = !!worker.pendingProposal

  if (worker.status === "active") {
    return (
      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <div className="h-1.5 w-1.5 rounded-full bg-current" />
        <span className="text-xs font-bold uppercase tracking-wider">Active</span>
      </div>
    )
  }

  if (hasPendingProposal) {
    return (
      <div className="flex items-center gap-1.5 text-amber-500">
        <Clock3 className="h-3 w-3" />
        <span className="text-xs font-bold uppercase tracking-wider">Proposal Pending</span>
      </div>
    )
  }

  if (worker.isTerminated) {
    return (
      <div className="flex items-center gap-1.5 text-destructive">
        <div className="h-1.5 w-1.5 rounded-full bg-current" />
        <span className="text-xs font-bold uppercase tracking-wider">Terminated</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-muted-foreground/70">
      <Pause className="h-3 w-3" />
      <span className="text-xs font-bold uppercase tracking-wider">Paused</span>
    </div>
  )
}

const Plus = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
)
