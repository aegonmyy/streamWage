"use client"

import { Card, CardContent } from "@/components/ui/card"
import { formatEth } from "@/hooks/use-payroll-admin-data"
import { cn } from "@/lib/utils"

interface WorkerStatsProps {
  totalWorkers: number
  activeWorkers: number
  triggerWorkers: number
  pausedWorkers: number
  pausedByProposal: number
  totalClaimableWei: bigint
  treasuryBalanceWei: bigint
}

export function WorkerStats({
  totalWorkers,
  activeWorkers,
  triggerWorkers,
  pausedWorkers,
  pausedByProposal,
  totalClaimableWei,
  treasuryBalanceWei,
}: WorkerStatsProps) {
  const isHighClaimable = treasuryBalanceWei > 0n && (totalClaimableWei * 100n / treasuryBalanceWei) > 50n

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Total Workers"
        value={totalWorkers}
        subLabel="Registered on contract"
      />
      <StatTile
        label="Active"
        value={activeWorkers}
        subLabel="Currently accruing"
        footnote={triggerWorkers > 0 ? `${triggerWorkers} on trigger timeline` : undefined}
      />
      <StatTile
        label="Paused"
        value={pausedWorkers}
        subLabel="Accrual halted"
        footnote={pausedByProposal > 0 ? `${pausedByProposal} paused by proposal` : undefined}
      />
      <StatTile
        label="Total Claimable"
        value={`${formatEth(totalClaimableWei)} ETH`}
        subLabel="Aggregate unclaimed earnings"
        variant={isHighClaimable ? "warning" : "neutral"}
      />
    </div>
  )
}

function StatTile({
  label,
  value,
  subLabel,
  footnote,
  variant = "neutral",
}: {
  label: string
  value: string | number
  subLabel: string
  footnote?: string
  variant?: "neutral" | "warning"
}) {
  return (
    <Card className={cn(
      "shadow-sm transition-all hover:shadow-md",
      variant === "warning" && "border-amber-500/40 bg-amber-500/5"
    )}>
      <CardContent className="p-3 md:p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg md:text-xl font-bold text-foreground break-words">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground font-medium">{subLabel}</p>
        {footnote && (
          <p className="mt-2 text-[10px] text-muted-foreground/60 italic leading-none">{footnote}</p>
        )}
      </CardContent>
    </Card>
  )
}
