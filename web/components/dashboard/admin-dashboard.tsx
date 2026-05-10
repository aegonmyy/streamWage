"use client"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import {
  AlertTriangle,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Info,
  LayoutDashboard,
  MoreHorizontal,
  OctagonAlert,
  Pause,
  Play,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  Users,
  Wallet,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { LottieAnimation } from "@/components/ui/lottie-animation"
import { useAccount, useWaitForTransactionReceipt } from "wagmi"
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
  formatWeiRatePerDay,
  usePayrollAdminData,
  type AdminWorkerRecord,
} from "@/hooks/use-payroll-admin-data"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { usePayrollWrite } from "@/hooks/use-payroll-write"
import { useReadContract } from "wagmi"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePayrollContractConfig } from "@/lib/payroll-contract"
import { getTransactionExplorerUrl, getTransactionToastDescription } from "@/lib/transaction-links"
import { cn } from "@/lib/utils"
import { getAdminDashboardPath } from "@/lib/payroll-routing"
import { getDisplayErrorMessage } from "@/lib/error-message"

import AdminLayout from "@/app/dashboard/admin-layout-shell"
import { WorkersView } from "./admin-workers/workers-view"
import { ProposalsView } from "./admin-proposals/proposals-view"

type AdminSectionId = "overview" | "workers" | "proposals" | "treasury" | "admins"

export const SIDEBAR_SECTIONS: Array<{
  id: AdminSectionId
  label: string
  description: string
  icon: any
}> = [
  { id: "overview", label: "Overview", description: "Treasury health, headcount, and urgent operator tasks.", icon: Zap },
  { id: "workers", label: "Workers", description: "Add workers, adjust terms, and manage active status.", icon: Users },
  { id: "proposals", label: "Proposals", description: "Track pending term changes that pause accrual until resolved.", icon: Clock3 },
  { id: "treasury", label: "Treasury", description: "Fund payroll, monitor runway, and manage safe withdrawals.", icon: Wallet },
  { id: "admins", label: "Admins", description: "Owner and operator access controls for the protocol.", icon: Shield },
]

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

function formatRunway(seconds: bigint) {
  if (seconds === 0n) return "0s"
  if (seconds === 2n ** 256n - 1n) return "∞"

  const day = 86_400n
  const hour = 3_600n
  const minute = 60n

  if (seconds > day * 2n) {
    return `${seconds / day} days`
  }
  
  if (seconds > hour * 1n) {
    const h = seconds / hour
    const m = (seconds % hour) / minute
    return `${h}h ${m}m`
  }
  
  return (
    <span className="animate-pulse text-destructive font-bold">
      {seconds / minute} minutes
    </span>
  )
}

function MetricCard({
  label,
  value,
  subLabel,
  variant = "neutral",
}: {
  label: string
  value: string | React.ReactNode
  subLabel: React.ReactNode
  variant?: "neutral" | "success" | "warning" | "danger"
}) {
  const borderClass = {
    neutral: "border-border/50",
    success: "border-l-4 border-l-emerald-500",
    warning: "border-l-4 border-l-amber-500",
    danger: "border-l-4 border-l-destructive",
  }[variant]

  const content = (
    <Card className={cn("overflow-hidden shadow-sm transition-all hover:shadow-md", borderClass)}>
      <CardHeader className="p-3 md:p-4 pb-1 md:pb-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="text-lg md:text-xl font-bold tracking-tight text-foreground break-words">{value}</div>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-0 md:pt-0">
        <p className="text-[11px] text-muted-foreground/80 leading-tight">{subLabel}</p>
      </CardContent>
    </Card>
  )

  if (label === "Runway") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">
              {content}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] p-3 rounded-xl border-border/60 shadow-xl">
            <p className="text-xs font-medium leading-relaxed">
              Estimated based on the treasury&apos;s free balance only. Does not account for pending worker claims or future funding.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return content
}

function AlertRow({
  title,
  subText,
  variant = "warning",
  icon: Icon,
  action,
}: {
  title: string
  subText?: string | React.ReactNode
  variant?: "success" | "warning" | "danger" | "info"
  icon: any
  action?: React.ReactNode
}) {
  const styles = {
    success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    danger: "border-destructive/20 bg-destructive/5 text-destructive",
    info: "border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-400",
  }[variant]

  const IconColor = {
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger: "text-destructive",
    info: "text-blue-500",
  }[variant]

  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between transition-all", styles)}>
      <div className="flex gap-4">
        <div className="mt-0.5 shrink-0">
          <Icon className={cn("h-6 w-6", IconColor)} />
        </div>
        <div>
          <p className="text-base font-bold leading-tight">{title}</p>
          {subText && <div className="mt-2 text-sm opacity-90 leading-relaxed font-medium">{subText}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function QuickStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 px-4 py-3 shadow-sm transition-all hover:bg-muted/30">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  )
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
  const content = (
    <Card className={cn("overflow-x-hidden", danger && "border-destructive/40 bg-destructive/5 shadow-sm")}>
      <CardHeader className="p-3 md:p-4 pb-1 md:pb-1">
        <CardDescription className="text-[11px] font-medium uppercase tracking-wider">{title}</CardDescription>
        <CardTitle className="text-lg md:text-xl font-bold tracking-tight break-words">{value}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-0 md:pt-0">
        <p className="text-[11px] text-muted-foreground/80 leading-tight break-words">{hint}</p>
      </CardContent>
    </Card>
  )

  if (title === "Runway") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">
              {content}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] p-3 rounded-xl border-border/60 shadow-xl">
            <p className="text-xs font-medium leading-relaxed">
              Estimated based on the treasury&apos;s free balance only. Does not account for pending worker claims or future funding.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return content
}

export function AdminDashboard() {
  const contract = usePayrollContractConfig()
  const { address: connectedAddress } = useAccount()
  const { contractAddress, chainId, isConfigured } = usePayrollRole()
  const { data, isLoading, isError, error, refetch } = usePayrollAdminData()
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const section = (searchParams.get("section") as AdminSectionId) || "overview"

  const [isFundingOpen, setIsFundingOpen] = useState(false)
  const [fundAmount, setFundAmount] = useState("")

  const [withdrawRecipient, setWithdrawRecipient] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [thresholdDays, setThresholdDays] = useState("")

  const [adminAddress, setAdminAddress] = useState("")
  const [ownershipAddress, setOwnershipAddress] = useState("")

  const { writeContractAsync, data: hash, isPending: isWalletPending } = usePayrollWrite()
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isError || !error) return
    toast.error("Admin dashboard", {
      description: getDisplayErrorMessage(error, "Could not load payroll details."),
    })
  }, [error, isError])

  const selectedSection = SIDEBAR_SECTIONS.find((item) => item.id === section) ?? SIDEBAR_SECTIONS[0]
  const workers = Array.isArray(data?.workers) ? data.workers : []
  const admins = Array.isArray(data?.admins) ? data.admins : []
  const pendingProposals = workers.filter((worker) => worker.pendingProposal)
  const owner = data?.owner
  const isOwner = !!owner && !!connectedAddress && getAddress(owner) === getAddress(connectedAddress)
  const treasuryBalanceWei = data?.treasuryBalanceWei ?? 0n
  const lowTreasuryThresholdSeconds = data?.lowTreasuryThresholdSeconds ?? 0n
  const runwaySeconds = data?.runwaySeconds ?? 0n
  const totalRatePerSecondWei = data?.totalRatePerSecondWei ?? 0n
  const lifetimePaidWei = data?.lifetimePaidWei ?? 0n
  const safeWithdrawableWei = data?.safeWithdrawableWei ?? 0n
  const isLowTreasury = lowTreasuryThresholdSeconds > 0n && runwaySeconds < lowTreasuryThresholdSeconds

  useEffect(() => {
    if (receipt.isSuccess) {
      refetch()
    }
  }, [receipt.isSuccess, refetch])

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
    } catch (caught) {
      const message = getDisplayErrorMessage(caught, "Transaction failed.")
      toast.error(actionLabel, { description: message })
    }
  }

  const navigateToSection = (id: AdminSectionId) => {
    if (!contract) return
    router.push(getAdminDashboardPath(contract.address, id === "overview" ? undefined : id))
  }

  const renderOverview = () => {
    const totalWorkersCount = workers.length
    const activeTimeBasedWorkers = workers.filter((w) => w.status === "active" && w.timeline !== "Trigger").length
    const triggerWorkersCount = workers.filter((w) => w.timeline === "Trigger").length
    const pendingMigrationsCount = workers.filter((w) => w.pendingMigration).length
    const expiringProposals = pendingProposals.filter((w) => {
      const now = BigInt(Math.floor(Date.now() / 1000))
      return w.pendingProposal!.expiryTimestamp - now < 86400n
    })
    const highStakesProposals = pendingProposals.filter((w) => w.pendingProposal!.terminateOnReject)
    const lowRunwayWorkers = workers.filter((w) => w.runwaySeconds < lowTreasuryThresholdSeconds)
    const insolvencyCount = workers.filter(w => w.claimableWei > (data?.treasuryBalanceWei ?? 0n)).length
    
    const runwayVariant = runwaySeconds > 86400n * 30n ? "success" : runwaySeconds > 86400n * 7n ? "warning" : "danger"

    const alerts = []

    if (runwaySeconds < 86400n * 7n && treasuryBalanceWei > 0n) {
      alerts.push(
        <AlertRow
          key="critical-treasury"
          title="Treasury is low"
          subText={`Current runway is only ${formatDuration(runwaySeconds)} — fund immediately.`}
          variant="danger"
          icon={ShieldAlert}
          action={
            <Button size="sm" className="rounded-xl h-9 px-5 text-sm" onClick={() => {
              navigateToSection("treasury")
              setIsFundingOpen(true)
            }}>
              Fund Treasury
            </Button>
          }
        />
      )
    }

    if (treasuryBalanceWei === 0n) {
      alerts.push(
        <AlertRow
          key="empty-treasury"
          title="Treasury is empty"
          subText="All worker accrual is unfunded and claims cannot be processed."
          variant="danger"
          icon={OctagonAlert}
          action={
            <Button size="sm" className="rounded-xl h-9 px-5 text-sm" onClick={() => {
              navigateToSection("treasury")
              setIsFundingOpen(true)
            }}>
              Fund Now
            </Button>
          }
        />
      )
    }

    if (expiringProposals.length > 0) {
      alerts.push(
        <AlertRow
          key="expiring-proposals"
          title={`${expiringProposals.length} proposal(s) expiring within 24 hours`}
          variant="danger"
          icon={Clock3}
          subText={
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {expiringProposals.map(w => (
                <span key={w.address} className="font-mono">
                  {w.address.slice(0, 6)}...{w.address.slice(-4)} ({humanExpiry(w.pendingProposal!.expiryTimestamp)})
                </span>
              ))}
            </div>
          }
          action={
            <Button variant="outline" size="sm" className="rounded-xl h-9 px-5 text-sm" onClick={() => navigateToSection("proposals")}>
              Review
            </Button>
          }
        />
      )
    }

    if (highStakesProposals.length > 0) {
      alerts.push(
        <AlertRow
          key="high-stakes-proposals"
          title={`${highStakesProposals.length} proposal(s) will terminate worker on rejection`}
          variant="warning"
          icon={AlertTriangle}
          subText={
            <div className="flex flex-wrap gap-2">
              {highStakesProposals.map(w => (
                <span key={w.address} className="font-mono">{w.address.slice(0, 6)}...{w.address.slice(-4)}</span>
              ))}
            </div>
          }
          action={
            <Button variant="outline" size="sm" className="rounded-xl h-9 px-5 text-sm" onClick={() => navigateToSection("proposals")}>
              Review
            </Button>
          }
        />
      )
    }

    const generalProposals = pendingProposals.filter(p => !expiringProposals.includes(p) && !highStakesProposals.includes(p))
    if (generalProposals.length > 0) {
      alerts.push(
        <AlertRow
          key="general-proposals"
          title={`${generalProposals.length} workers have pending term proposals awaiting response`}
          variant="warning"
          icon={Clock3}
          action={
            <Button variant="outline" size="sm" className="rounded-xl h-9 px-5 text-sm" onClick={() => navigateToSection("proposals")}>
              Review
            </Button>
          }
        />
      )
    }

    const pausedByProposal = workers.filter(w => w.status === "paused" && w.pendingProposal)
    if (pausedByProposal.length > 0) {
      alerts.push(
        <AlertRow
          key="paused-by-proposal"
          title={`${pausedByProposal.length} workers are paused — accrual halted until proposal resolves`}
          variant="warning"
          icon={Pause}
          action={
            <Button variant="outline" size="sm" className="rounded-xl h-9 px-5 text-sm" onClick={() => navigateToSection("proposals")}>
              View Workers
            </Button>
          }
        />
      )
    }

    if (lowRunwayWorkers.length > 0) {
      alerts.push(
        <AlertRow
          key="low-runway-workers"
          title={`${lowRunwayWorkers.length} workers have individual runway below threshold`}
          variant="warning"
          icon={TrendingDown}
          subText={
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {lowRunwayWorkers.map(w => (
                <span key={w.address} className="font-mono">
                  {w.address.slice(0, 6)}...{w.address.slice(-4)} ({formatDuration(w.runwaySeconds)})
                </span>
              ))}
            </div>
          }
          action={
            <Button variant="outline" size="sm" className="rounded-xl h-9 px-5 text-sm" onClick={() => navigateToSection("workers")}>
              Manage
            </Button>
          }
        />
      )
    }

    if (pendingMigrationsCount > 0) {
      alerts.push(
        <AlertRow
          key="pending-migrations"
          title={`${pendingMigrationsCount} worker address migration(s) awaiting acceptance`}
          variant="info"
          icon={Info}
          action={
            <Button variant="outline" size="sm" className="rounded-xl h-9 px-5 text-sm" onClick={() => navigateToSection("workers")}>
              View Details
            </Button>
          }
        />
      )
    }

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {/* Section 2: Key Metrics */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="Treasury Balance"
            value={`${formatEth(treasuryBalanceWei)} ETH`}
            subLabel="Current prefunded treasury balance"
          />
          <MetricCard
            label="Daily Burn Rate"
            value={totalRatePerSecondWei > 0n ? `${formatEth(totalRatePerSecondWei * 86400n)} ETH / day` : <span className="text-muted-foreground/60">No active drain</span>}
            subLabel="Aggregate drain across all active time-based workers"
          />
          <MetricCard
            label="Runway"
            value={activeTimeBasedWorkers > 0 ? formatRunway(runwaySeconds) : "—"}
            subLabel={activeTimeBasedWorkers > 0 ? "Projected exhaustion at current burn" : "No active accrual"}
            variant={activeTimeBasedWorkers > 0 ? runwayVariant : "neutral"}
          />
          <MetricCard
            label="Workers"
            value={
              <div className="flex items-baseline gap-1.5">
                <span>{activeTimeBasedWorkers} active</span>
                <span className="text-sm font-medium text-muted-foreground">/ {totalWorkersCount} total</span>
              </div>
            }
            subLabel={
              <div className="space-y-1">
                <p>Time-based accruing / all registered</p>
                {triggerWorkersCount > 0 && (
                  <p className="text-[10px] opacity-60 italic font-normal tracking-normal">{triggerWorkersCount} on trigger timeline</p>
                )}
              </div>
            }
          />
          <MetricCard
            label="Low Runway Workers"
            value={`${lowRunwayWorkers.length} workers`}
            subLabel={
              <div className="space-y-1">
                <p>{lowRunwayWorkers.length > 0 ? "Individual runway below threshold" : "All workers funded"}</p>
                {insolvencyCount > 0 && (
                  <p className="text-[10px] text-amber-500 font-bold uppercase tracking-tight">
                    {insolvencyCount} worker{insolvencyCount > 1 ? 's' : ''} cannot be fully paid now
                  </p>
                )}
              </div>
            }
            variant={lowRunwayWorkers.length > 0 ? "danger" : "success"}
          />
        </div>

        {/* Section 3: Needs Attention */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Needs Attention</h2>
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <div className="space-y-3">
            {alerts.length > 0 ? (
              alerts
            ) : (
              <AlertRow
                title="Everything looks good — no urgent actions."
                variant="success"
                icon={CheckCircle2}
              />
            )}
          </div>
        </div>

        {/* Section 4: Quick Stats */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quick Stats</h2>
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <QuickStat label="Total Workers" value={totalWorkersCount} />
            <QuickStat label="Pending Proposals" value={pendingProposals.length} />
            <QuickStat label="Pending Migrations" value={pendingMigrationsCount} />
            <QuickStat label="Lifetime Paid" value={`${formatEth(lifetimePaidWei, 2)} ETH`} />
          </div>
        </div>
      </div>
    )
  }

  const renderTreasury = () => (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatCard title="Balance" value={`${formatEth(treasuryBalanceWei)} ETH`} hint="Current treasury balance available to satisfy claims." danger={isLowTreasury} />
        <StatCard title="Runway" value={formatDuration(runwaySeconds)} hint="Estimated from `treasuryRunway()`." />
        <StatCard title="Drain rate" value={formatWeiRatePerDay(totalRatePerSecondWei)} hint="Aggregate active payroll drain." />
        <StatCard title="Safe withdrawable" value={`${formatEth(safeWithdrawableWei)} ETH`} hint="Computed using the contract's one-hour reserve rule." />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fund treasury</CardTitle>
            <CardDescription className="mobile-ellipsis-2">Send ETH through the contract’s `fundTreasury()` path.</CardDescription>
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
            <p className="mobile-ellipsis-2 text-sm text-muted-foreground">
              The treasury section updates when `TreasuryFunded`, `Claimed`, `ExcessWithdrawn`, or payroll state-change events land.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Treasury controls</CardTitle>
            <CardDescription className="mobile-ellipsis-2">Routine operator actions and owner-only treasury thresholds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 p-4">
              <p className="text-sm font-medium text-foreground">Withdraw excess</p>
              <p className="mobile-ellipsis-2 mt-1 text-sm text-muted-foreground">
                Pull only the amount above the enforced one-hour reserve buffer.
              </p>
              <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Available now</p>
                <p className="mobile-ellipsis-1 mt-1 font-mono text-sm font-semibold text-foreground">
                  {formatEth(safeWithdrawableWei, 4)} ETH
                </p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input value={withdrawRecipient} onChange={(event) => setWithdrawRecipient(event.target.value)} placeholder="Recipient address" className="font-mono mobile-anywhere" />
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
              <p className="mobile-ellipsis-2 mt-1 text-sm text-muted-foreground">
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

          {admins.map((admin) => (
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

  if (!isConfigured) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground sm:px-6">
          Open this page through a payroll contract route to enable the admin dashboard.
        </div>
      </AdminLayout>
    )
  }

  if (!connectedAddress) {
    return (
      <AdminLayout>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Shield className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-foreground">Connect Admin Wallet</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Connect an authorized operator or owner wallet to manage workers, treasury, and permissions.
          </p>
          <div className="mt-8">
            <ConnectButton />
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground sm:px-6">
          <LottieAnimation className="h-40 w-40 mx-auto" />
          <p className="mt-4 animate-pulse">Loading admin data from chain…</p>
        </div>
      </AdminLayout>
    )
  }


  if (isError || !data) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-16 sm:px-6">
          <p className="text-sm text-muted-foreground">We could not load this payroll right now.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <section className="min-w-0 space-y-6">
        <div className={cn(
          "rounded-[32px] border border-border/70 bg-card p-6",
          section === "overview" && "flex items-center justify-center text-center"
        )}>
          {section === "overview" ? (
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {selectedSection.label}
            </h1>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between w-full">
              <div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {selectedSection.label}
                </h1>
                <p className="mobile-ellipsis-2 mt-2 max-w-2xl text-sm text-muted-foreground">{selectedSection.description}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Protocol Context</p>
                <p className="mobile-ellipsis-2 mobile-anywhere mt-1 font-mono text-xs text-muted-foreground">
                  {isConfigured ? `${contractAddress} on chain ${chainId}` : "Contract not configured"}
                </p>
                {receipt.isSuccess ? (
                  <p className="mobile-ellipsis-1 mt-2 text-xs text-primary font-medium">Last transaction confirmed.</p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {section === "overview" ? renderOverview() : null}
        {section === "workers" ? <WorkersView /> : null}
        {section === "proposals" ? <ProposalsView /> : null}
        {section === "treasury" ? renderTreasury() : null}
        {section === "admins" ? renderAdmins() : null}
      </section>
    </AdminLayout>
  )
}
