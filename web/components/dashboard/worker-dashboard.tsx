"use client"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useCallback } from "react"
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
  BadgeCheck,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  User,
  Wallet,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { LottieAnimation } from "@/components/ui/lottie-animation"
import { useAccount, useDisconnect, useWaitForTransactionReceipt, useBalance, useReadContract } from "wagmi"
import { formatEther, getAddress, isAddress, type Address } from "viem"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import WorkerLayout from "@/app/dashboard/worker-layout-shell"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { usePayrollWrite } from "@/hooks/use-payroll-write"
import {
  formatDuration,
  formatEth,
  formatRate,
  formatTimeline,
  usePayrollWorkerData,
} from "@/hooks/use-payroll-worker-data"
import { usePayrollContractConfig } from "@/lib/payroll-contract"
import { getTransactionExplorerUrl, getTransactionToastDescription } from "@/lib/transaction-links"
import { cn } from "@/lib/utils"
import { getWorkerDashboardPath } from "@/lib/payroll-routing"

type WorkerSectionId = "overview" | "earnings" | "proposals" | "profile" | "support"

export const WORKER_SECTIONS: Array<{
  id: WorkerSectionId
  label: string
  eyebrow: string
  description: string
  icon: any
}> = [
  { id: "overview", label: "Overview", eyebrow: "Today", description: "Your claimable balance, status, and the next action that matters.", icon: LayoutDashboard },
  { id: "earnings", label: "Earnings", eyebrow: "Pay", description: "Claim funds, review totals, and understand how your timeline behaves.", icon: Wallet },
  { id: "proposals", label: "Proposals", eyebrow: "Review", description: "Accept, reject, or expire proposed terms that pause your accrual.", icon: Clock3 },
  { id: "profile", label: "Profile", eyebrow: "Identity", description: "Wallet details, metadata, and migration tools for moving your worker record.", icon: User },
  { id: "support", label: "Support", eyebrow: "Guide", description: "Plain-English help for timelines, pauses, migration, and treasury warnings.", icon: HelpCircle },
]

function toAddressOrThrow(value: string, label: string): Address {
  if (!isAddress(value.trim())) throw new Error(`${label} must be a valid address.`)
  return getAddress(value.trim())
}

function humanExpiry(expiryTimestamp: bigint) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (expiryTimestamp <= now) return "expired"
  return `in ${formatDuration(expiryTimestamp - now)}`
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function IncomingMigrationCard({
  address,
  migrationOldAddress,
  setMigrationOldAddress,
  incomingMigrationRequests,
  isWalletPending,
  onAccept,
}: {
  address?: Address
  migrationOldAddress: string
  setMigrationOldAddress: (value: string) => void
  incomingMigrationRequests: Address[]
  isWalletPending: boolean
  onAccept: () => void
}) {
  return (
    <Card className="rounded-[12px] md:rounded-2xl">
      <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
        <CardTitle className="text-base md:text-xl font-semibold">Accept migration</CardTitle>
        <CardDescription className="mobile-ellipsis-2 text-xs md:text-sm">
          This wallet was nominated as the destination for an existing worker record.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
        {incomingMigrationRequests.length > 0 ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-[11px] font-medium text-foreground">Incoming requests</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {incomingMigrationRequests.map((oldAddress) => (
                <Button
                  key={oldAddress}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 max-w-full rounded-full font-mono text-[10px]"
                  onClick={() => setMigrationOldAddress(oldAddress)}
                >
                  <span className="mobile-ellipsis-1 block max-w-[10rem]">{shortAddress(oldAddress)}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Destination wallet</p>
          <p className="mobile-ellipsis-1 mobile-anywhere mt-1 font-mono text-xs text-foreground">
            {address ?? "Not connected"}
          </p>
        </div>
        <Input
          value={migrationOldAddress}
          onChange={(event) => setMigrationOldAddress(event.target.value)}
          placeholder="Old worker address"
          className="font-mono h-10 md:h-9 mobile-anywhere"
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="w-full md:w-auto h-10 md:h-9 rounded-xl" disabled={isWalletPending}>
              Accept Migration
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Accept migration into this wallet?</AlertDialogTitle>
              <AlertDialogDescription>
                This will move the worker state from {migrationOldAddress || "the old wallet"} into {address ? shortAddress(address) : "this wallet"}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Back</AlertDialogCancel>
              <AlertDialogAction onClick={onAccept}>Accept Migration</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

function StatCard({
  title,
  value,
  hint,
  danger = false,
  className,
  onClick,
  children,
}: {
  title: string
  value: string
  hint: string
  danger?: boolean
  className?: string
  onClick?: () => void
  children?: React.ReactNode
}) {
  return (
    <Card 
      className={cn("rounded-[12px] md:rounded-2xl transition-all overflow-x-hidden", danger && "border-destructive/40 bg-destructive/5", className)}
      onClick={onClick}
    >
      <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
        <CardDescription className="text-xs md:text-sm">{title}</CardDescription>
        <CardTitle className="text-[28px] md:text-2xl font-semibold tracking-tight leading-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
        <p className="text-[12px] md:text-sm text-muted-foreground">{hint}</p>
        {children}
      </CardContent>
    </Card>
  )
}

export function WorkerDashboard() {
  const contract = usePayrollContractConfig()
  const { address, isConnected } = useAccount()
  const { isConfigured, contractAddress, chainId, isDevMode } = usePayrollRole()
  const { data, isLoading, isError, error, refetch } = usePayrollWorkerData()
  const router = useRouter()
  const searchParams = useSearchParams()
  const section = (searchParams.get("section") as WorkerSectionId) || "overview"

  const [claimToAddress, setClaimToAddress] = useState("")
  const [migrationAddress, setMigrationAddress] = useState("")
  const [migrationOldAddress, setMigrationOldAddress] = useState("")
  const [copied, setCopied] = useState(false)

  const navigateToSection = useCallback((id: WorkerSectionId) => {
    if (!contract) return
    router.push(getWorkerDashboardPath(contract.address, id === "overview" ? undefined : id))
  }, [contract, router])

  const { writeContractAsync, data: hash, isPending: isWalletPending } = usePayrollWrite()
  const receipt = useWaitForTransactionReceipt({ hash })

  const { data: treasuryBalance, refetch: refetchTreasury } = useBalance({
    address: contract?.address,
    query: { refetchInterval: 30_000 }
  })

  const theoreticalWei = data?.claimableWei ?? 0n
  const treasuryWei = treasuryBalance?.value ?? 0n
  const isSolvent = treasuryWei >= theoreticalWei
  const actualClaimableWei = isSolvent ? theoreticalWei : treasuryWei
  const shortfallWei = isSolvent ? 0n : theoreticalWei - treasuryWei
  const isTreasuryEmpty = treasuryWei === 0n
  const emergencyPaused = false
  const isProposalUrgent = !!data?.pendingProposal?.terminateOnReject

  const selectedSection = WORKER_SECTIONS.find((item) => item.id === section) ?? WORKER_SECTIONS[0]
  const hasIncomingMigrationAccess = (data?.incomingMigrationRequests?.length ?? 0) > 0
  const recentTransactions = (Array.isArray(data?.recentActivity) ? data.recentActivity : [])
    .filter((item) => item.txHash)
    .slice(0, 4)
    .map((item) => ({
      ...item,
      explorerUrl: contract ? getTransactionExplorerUrl(contract.chainId, item.txHash!) : "",
    }))

  useEffect(() => {
    const handler = () => navigateToSection("support")
    window.addEventListener("streamwage:open-worker-support", handler)
    return () => window.removeEventListener("streamwage:open-worker-support", handler)
  }, [navigateToSection])

  useEffect(() => {
    if (receipt.isSuccess) {
      Promise.all([refetch(), refetchTreasury()])
    }
  }, [receipt.isSuccess, refetch, refetchTreasury])

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
      const message = caught instanceof Error ? caught.message : "Transaction failed."
      toast.error(actionLabel, { description: message })
    }
  }

  const copyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  if (!contract) {
    return (
      <WorkerLayout>
        <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground sm:px-6">
          Open this page through a payroll contract route to enable worker reads.
        </div>
      </WorkerLayout>
    )
  }

  if (!isConnected && !isDevMode) {
    return (
      <WorkerLayout>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-foreground">Connect your wallet</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Connect a wallet to view your worker earnings, pending proposals, and migration state.
          </p>
          <div className="mt-8">
            <ConnectButton />
          </div>
        </div>
      </WorkerLayout>
    )
  }

  if (isLoading) {
    return (
      <WorkerLayout>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground sm:px-6">
          <LottieAnimation className="h-40 w-40 mx-auto" />
          <p className="mt-4 animate-pulse">Loading worker state from chain…</p>
        </div>
      </WorkerLayout>
    )
  }

  if (isError || !data) {
    return (
      <WorkerLayout>
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-16 sm:px-6">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load worker details for this payroll."}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </WorkerLayout>
    )
  }

  if (!data.exists) {
    if (hasIncomingMigrationAccess) {
      return (
        <WorkerLayout>
          <section className="min-w-0 space-y-6">
            <div className="rounded-[24px] md:rounded-[32px] border border-border/70 bg-card p-5 md:p-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Migration
                  </p>
                  <h1 className="mobile-ellipsis-1 mt-1 md:mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                    Accept worker migration
                  </h1>
                  <p className="mobile-ellipsis-2 mt-2 max-w-2xl text-sm text-muted-foreground">
                    This wallet has been selected as the destination for a worker move. Accept it here to bring the worker record into this address.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Role source</p>
                  <p className="mobile-ellipsis-2 mobile-anywhere mt-1 font-mono text-xs text-muted-foreground">
                    {isConfigured ? `${contractAddress} on chain ${chainId}` : "Contract not configured"}
                  </p>
                </div>
              </div>
            </div>

            <IncomingMigrationCard
              address={address}
              migrationOldAddress={migrationOldAddress}
              setMigrationOldAddress={setMigrationOldAddress}
              incomingMigrationRequests={data.incomingMigrationRequests}
              isWalletPending={isWalletPending}
              onAccept={() =>
                void executeWrite("Accept migration", async () =>
                  writeContractAsync({
                    ...contract!,
                    functionName: "acceptMigration",
                    args: [toAddressOrThrow(migrationOldAddress, "Old address")],
                  }),
                )
              }
            />

            <Card className="rounded-[12px] md:rounded-2xl">
              <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
                <CardTitle className="text-base md:text-xl font-semibold">Why this page is available</CardTitle>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                <p className="mobile-ellipsis-2 text-xs md:text-sm text-muted-foreground leading-relaxed">
                  The destination wallet can accept a pending move before it becomes an active worker on this payroll. After acceptance, this address takes over the worker record.
                </p>
              </CardContent>
            </Card>
          </section>
        </WorkerLayout>
      )
    }

    return (
      <WorkerLayout>
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-16 sm:px-6">
          <p className="mobile-ellipsis-2 text-sm text-muted-foreground">
            This wallet does not have a worker record on this payroll.
          </p>
          <p className="mobile-ellipsis-2 mobile-anywhere font-mono text-xs text-muted-foreground">
            {isConfigured ? `Role source: ${contractAddress} on chain ${chainId}` : "Contract not configured"}
          </p>
        </div>
      </WorkerLayout>
    )
  }

  const renderOverview = () => (
    <div className="space-y-4 sm:space-y-6">
      {data.pendingProposal && (
        <Card className="border-amber-200 bg-amber-50 rounded-[12px]">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Pending Proposal
              </CardTitle>
              <Badge variant="outline" className="text-[10px] h-5 uppercase tracking-wider border-amber-200 text-amber-700 bg-white/50">Action</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-900">
                {data.pendingProposal.timeline} · {formatEth(data.pendingProposal.amountPerIntervalWei)} ETH
              </p>
              <p className="text-[11px] text-amber-700/80">
                Expires {humanExpiry(data.pendingProposal.expiryTimestamp)}
              </p>
            </div>
            
            {data.pendingProposal.terminateOnReject && (
              <p className="text-[11px] font-medium text-destructive">
                Note: Rejection will terminate your employment.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <Button 
                size="sm" 
                className="flex-1 h-9 text-xs rounded-xl"
                onClick={() =>
                  void executeWrite("Accept terms", async () =>
                    writeContractAsync({
                      ...contract!,
                      functionName: "acceptTerms",
                      args: [],
                    }),
                  )
                }
              >
                Accept
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                className="flex-1 h-9 text-xs rounded-xl bg-white border-amber-200 text-amber-900 hover:bg-amber-100"
                onClick={() =>
                  void executeWrite("Reject terms", async () =>
                    writeContractAsync({
                      ...contract!,
                      functionName: "rejectTerms",
                      args: [],
                    }),
                  )
                }
              >
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Claimable"
          value={`${formatEth(theoreticalWei)} ETH`}
          hint={isSolvent ? "Available to claim." : `Shortfall: ${formatEth(shortfallWei)} ETH`}
          danger={!isSolvent}
        >
          <div className="mt-2 space-y-2">
            {!isSolvent && !isTreasuryEmpty && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-[10px] text-amber-600 font-medium leading-tight">
                ⚠ Treasury can only cover {formatEth(actualClaimableWei)} ETH right now.
              </div>
            )}
            {isTreasuryEmpty && (
              <p className="text-[10px] text-destructive font-medium">
                ✗ Treasury is empty — claim will fail
              </p>
            )}
            {isSolvent && theoreticalWei > 0n && (
              <p className="text-[10px] text-emerald-600 font-medium">
                ✓ Treasury can cover this claim
              </p>
            )}
          </div>
          <div className="mt-3 sm:hidden">
            {emergencyPaused ? (
              <Button className="w-full h-9 text-xs rounded-xl bg-muted text-muted-foreground" disabled>
                Protocol paused — claims disabled
              </Button>
            ) : (
              <Button
                className="w-full h-9 text-xs gap-2 rounded-xl"
                disabled={isWalletPending || isTreasuryEmpty || !data.active}
                onClick={() =>
                  void executeWrite("Claim earnings", async () =>
                    writeContractAsync({
                      ...contract!,
                      functionName: "claim",
                      args: [],
                    }),
                  )
                }
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                {data.active ? `Claim ${formatEth(actualClaimableWei)} ETH` : "Paused — cannot claim"}
              </Button>
            )}
          </div>
        </StatCard>

        <StatCard
          title="Status"
          value={data.active ? "Active" : "Paused"}
          hint={data.pendingProposal ? "Proposal pending — tap to view" : "No pending proposal."}
          danger={!data.active}
          className="cursor-pointer sm:cursor-default"
          onClick={() => {
            if (window.innerWidth < 768) navigateToSection("proposals")
          }}
        />

        <StatCard
          title="Timeline"
          value={formatTimeline(data)}
          hint={data.timeline === "Trigger" ? "Trigger" : formatRate(data)}
        />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <StatCard
                  title="Worker Runway"
                  value={data.runwaySeconds === 0n ? "No runway" : formatDuration(data.runwaySeconds)}
                  hint={data.runwaySeconds === 0n ? "Treasury empty or paused" : "Estimated runway."}
                  danger={data.runwaySeconds === 0n}
                >
                  {data.runwaySeconds > 0n && (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          data.runwaySeconds < 86400n ? "bg-destructive" : "bg-primary"
                        )}
                        style={{ width: `${Math.min(100, Number(data.runwaySeconds) / 2592000 * 100)}%` }}
                      />
                    </div>
                  )}
                </StatCard>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] p-3 rounded-xl border-border/60 shadow-xl">
              <p className="text-xs font-medium leading-relaxed">
                Estimated based on the treasury&apos;s free balance only. Does not account for pending worker claims or future funding.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Card className="sm:hidden">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Latest Transactions</CardTitle>
            <Button variant="link" size="sm" className="h-auto p-0 text-[11px]" onClick={() => navigateToSection("earnings")}>
              View all
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-2">
          {recentTransactions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No recent transactions.</p>
          ) : (
            recentTransactions.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                <span className="font-mono text-[11px] text-primary">{shortAddress(item.txHash!)}</span>
                <Badge variant="outline" className="text-[9px] h-4 px-1">{item.actionLabel.toLowerCase()}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.35fr]">
        <Card className={cn(isProposalUrgent && "border-destructive/40", "hidden md:block")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isProposalUrgent ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <BadgeCheck className="h-5 w-5 text-primary" />}
              Worker Notes
            </CardTitle>
            <CardDescription>Plain-English context around your live payroll state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              If a proposal is pending, your accrual is paused until you respond or the proposal expires.
            </p>
            <p>
              If your timeline is Trigger, your claimable balance only changes when an operator grants a payment.
            </p>
            <p className="font-mono text-xs">
              {isConfigured ? `Role source: ${contractAddress} on chain ${chainId}` : "Contract not configured"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Transactions</CardTitle>
            <CardDescription>Recent worker-related transactions with explorer links.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No worker transactions indexed yet.</p>
            ) : (
              recentTransactions.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border/70 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <span className="text-xs text-muted-foreground">({item.actionLabel})</span>
                  </div>
                  {item.explorerUrl ? (
                    <Link
                      href={item.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block font-mono text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {item.txHash}
                    </Link>
                  ) : (
                    <p className="mt-2 font-mono text-xs text-muted-foreground">{item.txHash}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Contract events relevant to this worker, newest first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent worker events yet.</p>
          ) : (
            data.recentActivity.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl border border-border/70 px-4 py-4",
                  item.tone === "warning" && "border-destructive/30 bg-destructive/5",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                  </div>
                  <Badge variant={item.tone === "warning" ? "destructive" : "secondary"} className="rounded-full">
                    {item.tone === "warning" ? "Attention" : "Event"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderEarnings = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Claimable now" value={`${formatEth(theoreticalWei)} ETH`} hint={isSolvent ? "Available to claim immediately." : `Treasury capped: ${formatEth(actualClaimableWei)} ETH`} danger={!isSolvent} />
        <StatCard title="Accrued checkpoint" value={`${formatEth(data.accruedWei)} ETH`} hint="Accrued onchain balance." />
        <StatCard title="Total claimed" value={`${formatEth(data.totalClaimedWei)} ETH`} hint="Lifetime claimed." />
        <StatCard title="Current rate" value={data.timeline === "Trigger" ? "Trigger" : formatRate(data)} hint="Active compensation timeline." />
      </div>

      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2">
        <Card className="rounded-[12px] md:rounded-2xl overflow-hidden">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
            <CardTitle className="text-base md:text-xl font-semibold">Claim earnings</CardTitle>
            <CardDescription className="text-xs md:text-sm">Primary worker action.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
            {!isSolvent && !isTreasuryEmpty && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-bold uppercase tracking-wider">Treasury Shortfall</p>
                </div>
                <p className="text-sm">
                  The treasury can only cover <span className="font-bold">{formatEth(actualClaimableWei)} ETH</span> of your <span className="font-bold">{formatEth(theoreticalWei)} ETH</span> claim right now.
                </p>
                <p className="text-xs opacity-70">
                  Shortfall: {formatEth(shortfallWei)} ETH
                </p>
              </div>
            )}

            {isTreasuryEmpty && (
              <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive space-y-2">
                <p className="text-sm font-bold">✗ Treasury is empty — claim will fail</p>
              </div>
            )}

            {emergencyPaused ? (
              <div className="space-y-3">
                <Button className="w-full md:w-auto h-10 md:h-9 rounded-xl bg-muted text-muted-foreground" disabled>
                  Protocol paused — claims disabled
                </Button>
                <p className="text-xs text-muted-foreground italic">
                  The operator has paused the protocol. Claims will resume when the operator lifts the pause.
                </p>
              </div>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    className="w-full md:w-auto gap-2 rounded-xl h-10 md:h-9" 
                    disabled={isWalletPending || isTreasuryEmpty || !data.active}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Claim {formatEth(actualClaimableWei)} ETH
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm payout?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {isSolvent 
                        ? `This will send ${formatEth(theoreticalWei)} ETH to your wallet.`
                        : `This will send the remaining treasury balance (${formatEth(actualClaimableWei)} ETH) to your wallet. The remaining ${formatEth(shortfallWei)} ETH can be claimed later.`
                      }
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Back</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void executeWrite("Claim earnings", async () =>
                          writeContractAsync({
                            ...contract!,
                            functionName: "claim",
                            args: [],
                          }),
                        )
                      }
                    >
                      Confirm Claim
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <p className="text-xs text-muted-foreground">
              This sends your claimable balance to {address ? shortAddress(address) : "the connected wallet"}.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[12px] md:rounded-2xl">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
            <CardTitle className="text-base md:text-xl font-semibold">Claim to another address</CardTitle>
            <CardDescription className="text-xs md:text-sm">Use `claimTo(address)` for custom payout destination.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
            <Input value={claimToAddress} onChange={(event) => setClaimToAddress(event.target.value)} placeholder="0x..." className="font-mono h-10 md:h-9" disabled={!!emergencyPaused} />
            {emergencyPaused ? (
              <Button variant="outline" className="w-full md:w-auto rounded-xl h-10 md:h-9" disabled>
                Protocol paused
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full md:w-auto rounded-xl h-10 md:h-9" disabled={isWalletPending || isTreasuryEmpty || !data.active}>
                    Claim {formatEth(actualClaimableWei)} ETH To Recipient
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Claim to custom recipient?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will send {formatEth(actualClaimableWei)} ETH to {claimToAddress || "the entered address"}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Back</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void executeWrite("Claim to address", async () =>
                          writeContractAsync({
                            ...contract!,
                            functionName: "claimTo",
                            args: [toAddressOrThrow(claimToAddress, "Recipient")],
                          }),
                        )
                      }
                    >
                      Confirm Payout
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderProposals = () => (
    <div className="space-y-4 sm:space-y-6">
      <Card className={cn(data.pendingProposal && "border-warning/50 bg-warning/5", "rounded-[12px] md:rounded-2xl")}>
        <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
          <CardTitle className="text-base md:text-xl font-semibold">Pending terms</CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {data.pendingProposal ? "Accrual is paused until resolution." : "No pending proposal."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          {!data.pendingProposal ? (
            <p className="text-xs text-muted-foreground">No pending proposal.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Proposed timeline" value={data.pendingProposal.timeline} hint={formatDuration(data.pendingProposal.intervalSeconds)} />
                <StatCard title="Proposed rate" value={data.pendingProposal.timeline === "Trigger" ? "Trigger" : `${formatEth(data.pendingProposal.amountPerIntervalWei)} ETH`} hint="Per proposed interval." />
                <StatCard title="Expires" value={humanExpiry(data.pendingProposal.expiryTimestamp)} hint="Side may call expire." danger />
                <StatCard title="Reject effect" value={data.pendingProposal.terminateOnReject ? "Terminate" : "Resume old terms"} hint="Determined by proposal." danger={data.pendingProposal.terminateOnReject} />
              </div>

              {data.pendingProposal.proposalNote && (
                <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600/60">Message from operator</p>
                  <blockquote className="mobile-ellipsis-2 text-sm text-blue-900/80 italic leading-relaxed">
                    &quot;{data.pendingProposal.proposalNote}&quot;
                  </blockquote>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="flex-1 sm:flex-none h-10 md:h-9 rounded-xl" disabled={isWalletPending}>Accept Terms</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Accept proposed terms?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This applies the proposed timeline and payment terms immediately.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Back</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          void executeWrite("Accept terms", async () =>
                            writeContractAsync({
                              ...contract!,
                              functionName: "acceptTerms",
                              args: [],
                            }),
                          )
                        }
                      >
                        Accept
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="flex-1 sm:flex-none h-10 md:h-9 rounded-xl" disabled={isWalletPending}>Reject Terms</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject proposed terms?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {data.pendingProposal.terminateOnReject
                          ? "Rejecting this proposal can terminate your worker record."
                          : "Rejecting restores your previous worker terms."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Back</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          void executeWrite("Reject terms", async () =>
                            writeContractAsync({
                              ...contract!,
                              functionName: "rejectTerms",
                              args: [],
                            }),
                          )
                        }
                      >
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto h-10 md:h-9 rounded-xl"
                  disabled={isWalletPending}
                  onClick={() =>
                    void executeWrite("Expire proposal", async () =>
                      writeContractAsync({
                        ...contract!,
                        functionName: "expireProposal",
                        args: [data.address],
                      }),
                    )
                  }
                >
                  Expire If Eligible
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderProfile = () => (
    <div className="space-y-4 sm:space-y-6">
      <Card className="rounded-[12px] md:rounded-2xl">
        <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
          <CardTitle className="text-base md:text-xl font-semibold">Worker profile</CardTitle>
          <CardDescription className="mobile-ellipsis-2 text-xs md:text-sm">Wallet identity and metadata.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 divide-y divide-border text-xs md:text-sm">
          <div className="flex justify-between gap-4 py-3 first:pt-0">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium text-foreground">{data.active ? "Active" : "Paused"}</span>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <span className="text-muted-foreground">Timeline</span>
            <span className="font-medium text-foreground">{formatTimeline(data)}</span>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <span className="text-muted-foreground">Metadata</span>
            <span className="mobile-ellipsis-2 max-w-[12rem] md:max-w-[24rem] text-right text-foreground">{data.metadata || "—"}</span>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <span className="text-muted-foreground">Wallet</span>
            <button type="button" onClick={copyAddress} className="flex items-center gap-2 font-mono text-[10px] md:text-xs text-foreground hover:underline">
              {shortAddress(data.address)}
              {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2">
        <Card className="rounded-[12px] md:rounded-2xl">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
            <CardTitle className="text-base md:text-xl font-semibold">Propose migration</CardTitle>
          <CardDescription className="mobile-ellipsis-2 text-xs md:text-sm">Move your worker record to a new wallet.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
            <Input value={migrationAddress} onChange={(event) => setMigrationAddress(event.target.value)} placeholder="New wallet address" className="font-mono h-10 md:h-9 mobile-anywhere" />
            <div className="flex flex-wrap gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="flex-1 md:flex-none h-10 md:h-9 gap-2 rounded-xl" disabled={isWalletPending}>
                    <ArrowRightLeft className="h-4 w-4" />
                    Propose
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Propose wallet migration?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your worker record stays here until {migrationAddress || "the new wallet"} accepts.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Back</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void executeWrite("Propose migration", async () =>
                          writeContractAsync({
                            ...contract!,
                            functionName: "proposeMigration",
                            args: [toAddressOrThrow(migrationAddress, "New address")],
                          }),
                        )
                      }
                    >
                      Propose
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="flex-1 md:flex-none h-10 md:h-9 rounded-xl" disabled={isWalletPending || !data.pendingMigration}>
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel pending migration?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the pending move to {data.pendingMigration?.newAddress ? shortAddress(data.pendingMigration.newAddress) : "the destination wallet"}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Back</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void executeWrite("Cancel migration", async () =>
                          writeContractAsync({
                            ...contract!,
                            functionName: "cancelMigration",
                            args: [],
                          }),
                        )
                      }
                    >
                      Cancel Migration
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        <IncomingMigrationCard
          address={address}
          migrationOldAddress={migrationOldAddress}
          setMigrationOldAddress={setMigrationOldAddress}
          incomingMigrationRequests={data.incomingMigrationRequests}
          isWalletPending={isWalletPending}
          onAccept={() =>
            void executeWrite("Accept migration", async () =>
              writeContractAsync({
                ...contract!,
                functionName: "acceptMigration",
                args: [toAddressOrThrow(migrationOldAddress, "Old address")],
              }),
            )
          }
        />
      </div>
    </div>
  )

  const renderSupport = () => (
    <div className="space-y-3 md:space-y-4">
      {[
        {
          title: "Timeline types",
          body: "Hourly and Monthly accrue over time. Custom uses an operator-defined interval. Trigger does not accrue continuously and only changes when an operator grants payment.",
        },
        {
          title: "Why you might be paused",
          body: "A worker can be paused manually by an operator, or temporarily paused because there is a pending terms proposal. Pending proposals stop new accrual until resolved.",
        },
        {
          title: "Treasury runway",
          body: "Your worker runway is a personal estimate of how long the current treasury can fund your share of payroll. It is not a guarantee of future funding.",
        },
        {
          title: "Migration flow",
          body: "You propose a new wallet from the current worker address. Then the destination wallet accepts the migration. Only after acceptance does the worker state move.",
        },
        {
          title: "Recent activity",
          body: "The overview activity feed comes from payroll contract events related to your worker address, including claims, proposals, migrations, and low-treasury warnings.",
        },
      ].map((item) => (
        <Card key={item.title} className="rounded-[12px] md:rounded-2xl">
          <CardHeader className="p-4 md:p-6 pb-2 md:pb-2">
            <CardTitle className="text-sm md:text-base font-semibold">{item.title}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
            <p className="mobile-ellipsis-2 text-xs md:text-sm text-muted-foreground leading-relaxed">{item.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )

  return (
    <WorkerLayout>
      <section className="min-w-0 space-y-6">
        <div className="rounded-[24px] md:rounded-[32px] border border-border/70 bg-card p-5 md:p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {selectedSection.eyebrow}
              </p>
              <h1 className="mobile-ellipsis-1 mt-1 md:mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                {selectedSection.label}
              </h1>
              <p className="mobile-ellipsis-2 mt-2 max-w-2xl text-sm text-muted-foreground">
                {selectedSection.description}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 hidden md:block">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Latest Txns</p>
                {section === "support" ? (
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => navigateToSection("overview")}>
                    Back
                  </Button>
                ) : null}
              </div>
              <div className="mt-2 space-y-2">
                {recentTransactions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recent indexed worker transactions.</p>
                ) : (
                  recentTransactions.map((item) =>
                    item.explorerUrl ? (
                      <Link
                        key={item.id}
                        href={item.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {shortAddress(item.txHash!)} <span className="text-muted-foreground">({item.actionLabel})</span>
                      </Link>
                    ) : (
                      <p key={item.id} className="font-mono text-xs text-muted-foreground">
                        {shortAddress(item.txHash!)} ({item.actionLabel})
                      </p>
                    ),
                  )
                )}
              </div>
              {receipt.isSuccess ? <p className="mt-2 text-xs text-primary">Most recent write confirmed.</p> : null}
              <p className="mobile-ellipsis-2 mobile-anywhere mt-2 text-xs text-muted-foreground">
                {isConfigured ? `${contractAddress} on chain ${chainId}` : "Contract not configured"}
              </p>
            </div>
          </div>
        </div>

        {section === "overview" ? renderOverview() : null}
        {section === "earnings" ? renderEarnings() : null}
        {section === "proposals" ? renderProposals() : null}
        {section === "profile" ? renderProfile() : null}
        {section === "support" ? renderSupport() : null}
      </section>
    </WorkerLayout>
  )
}
