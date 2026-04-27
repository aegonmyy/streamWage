"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  CircleHelp,
  Clock3,
  Copy,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import { getAddress, isAddress, type Address } from "viem"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import {
  formatDuration,
  formatEth,
  formatRate,
  formatTimeline,
  usePayrollWorkerData,
} from "@/hooks/use-payroll-worker-data"
import { getPayrollContractConfig } from "@/lib/payroll-contract"
import { getTransactionToastDescription } from "@/lib/transaction-links"
import { cn } from "@/lib/utils"

type WorkerSectionId = "overview" | "earnings" | "proposals" | "profile" | "support"

const WORKER_SECTIONS: Array<{
  id: WorkerSectionId
  label: string
  eyebrow: string
  description: string
}> = [
  { id: "overview", label: "Overview", eyebrow: "Today", description: "Your claimable balance, status, and the next action that matters." },
  { id: "earnings", label: "Earnings", eyebrow: "Pay", description: "Claim funds, review totals, and understand how your timeline behaves." },
  { id: "proposals", label: "Proposals", eyebrow: "Review", description: "Accept, reject, or expire proposed terms that pause your accrual." },
  { id: "profile", label: "Profile", eyebrow: "Identity", description: "Wallet details, metadata, and migration tools for moving your worker record." },
  { id: "support", label: "Support", eyebrow: "Guide", description: "Plain-English help for timelines, pauses, migration, and treasury warnings." },
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

export function WorkerDashboard() {
  const contract = getPayrollContractConfig()
  const { address, isConnected } = useAccount()
  const { isConfigured, contractAddress, chainId } = usePayrollRole()
  const { data, isLoading, isError, error, refetch } = usePayrollWorkerData()
  const [section, setSection] = useState<WorkerSectionId>("overview")
  const [claimToAddress, setClaimToAddress] = useState("")
  const [migrationAddress, setMigrationAddress] = useState("")
  const [migrationOldAddress, setMigrationOldAddress] = useState("")
  const [copied, setCopied] = useState(false)

  const { writeContractAsync, data: hash, isPending: isWalletPending } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash })

  const selectedSection = WORKER_SECTIONS.find((item) => item.id === section) ?? WORKER_SECTIONS[0]
  const overviewPriority = useMemo(
    () =>
      data
        ? [
            {
              title: "Claimable Now",
              value: `${formatEth(data.claimableWei)} ETH`,
              hint: "Use Claim when you want funds sent to the connected wallet immediately.",
              target: "earnings" as const,
            },
            {
              title: "Pending Terms",
              value: data.pendingProposal ? "Action required" : "No open proposal",
              hint: data.pendingProposal
                ? "Accrual is paused until you accept, reject, or the proposal expires."
                : "No operator proposal is waiting on you.",
              target: "proposals" as const,
            },
            {
              title: "Wallet Identity",
              value: data.pendingMigration ? "Migration pending" : "Current wallet live",
              hint: data.pendingMigration
                ? "The destination wallet must accept the migration to complete the move."
                : "Open profile tools when you need to move your worker record.",
              target: "profile" as const,
            },
          ]
        : [],
    [data],
  )

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

  const copyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  if (!contract) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground sm:px-6">
        Configure `NEXT_PUBLIC_PAYROLL_CONTRACT_ADDRESS` and `NEXT_PUBLIC_PAYROLL_CHAIN_ID` to enable worker reads.
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground sm:px-6">
        Connect a wallet to view worker earnings, proposals, and migration state.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground sm:px-6">
        Loading worker state from chain…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-16 sm:px-6">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load worker state."}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  if (!data.exists) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-16 sm:px-6">
        <p className="text-sm text-muted-foreground">
          This wallet is not registered as a worker in the payroll contract.
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {isConfigured ? `Role source: ${contractAddress} on chain ${chainId}` : "Contract not configured"}
        </p>
      </div>
    )
  }

  const isProposalUrgent = !!data.pendingProposal

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Claimable" value={`${formatEth(data.claimableWei)} ETH`} hint="Live read from `claimable(address)`." />
        <StatCard title="Status" value={data.active ? "Active" : "Paused"} hint={data.pendingProposal ? "A pending proposal is currently pausing accrual." : "No pending proposal is forcing a pause."} danger={!data.active} />
        <StatCard title="Timeline" value={formatTimeline(data)} hint={data.timeline === "Trigger" ? "Trigger workers accrue only when an operator grants payment." : formatRate(data)} />
        <StatCard title="Worker Runway" value={formatDuration(data.runwaySeconds)} hint="Personalized runway from `workerRunway(address)`." />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Priority Queue</CardTitle>
            <CardDescription>Your worker dashboard should answer what you can do now and what is waiting on you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overviewPriority.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setSection(item.target)}
                className="flex w-full items-start justify-between rounded-2xl border border-border/70 bg-card px-4 py-4 text-left transition hover:border-primary/40 hover:bg-muted/40"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">{item.value}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.hint}</p>
                </div>
                <ArrowUpRight className="mt-1 h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className={cn(isProposalUrgent && "border-destructive/40")}>
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
      </div>
    </div>
  )

  const renderEarnings = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Claimable now" value={`${formatEth(data.claimableWei)} ETH`} hint="Available to claim immediately." />
        <StatCard title="Accrued checkpoint" value={`${formatEth(data.accruedWei)} ETH`} hint="Accrued onchain balance before any fresh view-based accrual." />
        <StatCard title="Total claimed" value={`${formatEth(data.totalClaimedWei)} ETH`} hint="Lifetime claimed from the payroll contract." />
        <StatCard title="Current rate" value={data.timeline === "Trigger" ? "Trigger" : formatRate(data)} hint="Your active compensation timeline." />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Claim earnings</CardTitle>
            <CardDescription>Primary worker action. Use `claim()` to send funds to the connected wallet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="gap-2 rounded-xl"
              disabled={isWalletPending || data.claimableWei === 0n}
              onClick={() =>
                void executeWrite("Claim earnings", async () =>
                  writeContractAsync({
                    ...contract,
                    functionName: "claim",
                    args: [],
                  }),
                )
              }
            >
              <ArrowUpRight className="h-4 w-4" />
              Claim To Connected Wallet
            </Button>
            <p className="text-sm text-muted-foreground">
              This sends your claimable balance to {address ? shortAddress(address) : "the connected wallet"}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Claim to another address</CardTitle>
            <CardDescription>Use `claimTo(address)` when you want payout sent somewhere else.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={claimToAddress} onChange={(event) => setClaimToAddress(event.target.value)} placeholder="0x..." className="font-mono" />
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={isWalletPending || data.claimableWei === 0n}
              onClick={() =>
                void executeWrite("Claim to address", async () =>
                  writeContractAsync({
                    ...contract,
                    functionName: "claimTo",
                    args: [toAddressOrThrow(claimToAddress, "Recipient")],
                  }),
                )
              }
            >
              Claim To Recipient
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderProposals = () => (
    <div className="space-y-6">
      <Card className={cn(data.pendingProposal && "border-destructive/40")}>
        <CardHeader>
          <CardTitle>Pending terms</CardTitle>
          <CardDescription>
            This reads your `pendingTerms(address)` entry directly. If it exists, accrual is paused until resolution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data.pendingProposal ? (
            <p className="text-sm text-muted-foreground">No pending proposal.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard title="Proposed timeline" value={data.pendingProposal.timeline} hint={formatDuration(data.pendingProposal.intervalSeconds)} />
                <StatCard title="Proposed rate" value={data.pendingProposal.timeline === "Trigger" ? "Trigger" : `${formatEth(data.pendingProposal.amountPerIntervalWei)} ETH`} hint="Per proposed interval." />
                <StatCard title="Expires" value={humanExpiry(data.pendingProposal.expiryTimestamp)} hint="Once expired, either side may call expire." danger />
                <StatCard title="Reject effect" value={data.pendingProposal.terminateOnReject ? "Terminate" : "Resume old terms"} hint="Determined by the proposal payload." danger={data.pendingProposal.terminateOnReject} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="rounded-xl"
                  disabled={isWalletPending}
                  onClick={() =>
                    void executeWrite("Accept terms", async () =>
                      writeContractAsync({
                        ...contract,
                        functionName: "acceptTerms",
                        args: [],
                      }),
                    )
                  }
                >
                  Accept Terms
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={isWalletPending}
                  onClick={() =>
                    void executeWrite("Reject terms", async () =>
                      writeContractAsync({
                        ...contract,
                        functionName: "rejectTerms",
                        args: [],
                      }),
                    )
                  }
                >
                  Reject Terms
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={isWalletPending}
                  onClick={() =>
                    void executeWrite("Expire proposal", async () =>
                      writeContractAsync({
                        ...contract,
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Worker profile</CardTitle>
          <CardDescription>Wallet identity, metadata, and migration tools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-border text-sm">
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
            <span className="max-w-[24rem] text-right text-foreground">{data.metadata || "—"}</span>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <span className="text-muted-foreground">Wallet</span>
            <button type="button" onClick={copyAddress} className="flex items-center gap-2 font-mono text-xs text-foreground hover:underline sm:text-sm">
              {shortAddress(data.address)}
              {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          </div>
          <div className="flex justify-between gap-4 py-3 last:pb-0">
            <span className="text-muted-foreground">Pending migration</span>
            <span className="font-mono text-xs text-foreground sm:text-sm">
              {data.pendingMigration ? shortAddress(data.pendingMigration.newAddress) : "None"}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Propose migration</CardTitle>
            <CardDescription>Start moving your worker record to a new wallet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={migrationAddress} onChange={(event) => setMigrationAddress(event.target.value)} placeholder="New wallet address" className="font-mono" />
            <div className="flex flex-wrap gap-2">
              <Button
                className="gap-2 rounded-xl"
                disabled={isWalletPending}
                onClick={() =>
                  void executeWrite("Propose migration", async () =>
                    writeContractAsync({
                      ...contract,
                      functionName: "proposeMigration",
                      args: [toAddressOrThrow(migrationAddress, "New address")],
                    }),
                  )
                }
              >
                <ArrowRightLeft className="h-4 w-4" />
                Propose Migration
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                disabled={isWalletPending || !data.pendingMigration}
                onClick={() =>
                  void executeWrite("Cancel migration", async () =>
                    writeContractAsync({
                      ...contract,
                      functionName: "cancelMigration",
                      args: [],
                    }),
                  )
                }
              >
                Cancel Migration
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accept migration</CardTitle>
            <CardDescription>Use this on the destination wallet to accept a proposed migration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={migrationOldAddress} onChange={(event) => setMigrationOldAddress(event.target.value)} placeholder="Old worker address" className="font-mono" />
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={isWalletPending}
              onClick={() =>
                void executeWrite("Accept migration", async () =>
                  writeContractAsync({
                    ...contract,
                    functionName: "acceptMigration",
                    args: [toAddressOrThrow(migrationOldAddress, "Old address")],
                  }),
                )
              }
            >
              Accept Migration
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderSupport = () => (
    <div className="space-y-4">
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
      ].map((item) => (
        <Card key={item.title}>
          <CardHeader>
            <CardTitle className="text-base">{item.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{item.body}</p>
          </CardContent>
        </Card>
      ))}
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
                  <Wallet className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Worker Dashboard</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Centered on claiming, proposals, and wallet identity.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge className="rounded-full">Worker</Badge>
                {data.pendingProposal ? (
                  <Badge variant="destructive" className="rounded-full">Action required</Badge>
                ) : null}
              </div>
            </div>

            <div className="space-y-1 p-3">
              {WORKER_SECTIONS.map((item) => {
                const active = item.id === section
                const highlightProposal = item.id === "proposals" && data.pendingProposal
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "w-full rounded-2xl px-4 py-3 text-left transition",
                      active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted",
                      !active && highlightProposal && "border border-destructive/30 bg-destructive/5",
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
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Worker State</p>
                <p className="mt-1 text-sm text-foreground">
                  Your live record comes from <span className="font-mono text-xs">workers(address)</span>, <span className="font-mono text-xs">claimable(address)</span>, and related reads.
                </p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {isConfigured ? `${contractAddress} on chain ${chainId}` : "Contract not configured"}
                </p>
                {receipt.isSuccess ? <p className="mt-2 text-xs text-primary">Last transaction confirmed.</p> : null}
              </div>
            </div>
          </div>

          {section === "overview" ? renderOverview() : null}
          {section === "earnings" ? renderEarnings() : null}
          {section === "proposals" ? renderProposals() : null}
          {section === "profile" ? renderProfile() : null}
          {section === "support" ? renderSupport() : null}
        </section>
      </div>
    </div>
  )
}
