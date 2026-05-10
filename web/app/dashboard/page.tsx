"use client"

import { useEffect, useMemo, useState } from "react"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useRouter } from "next/navigation"
import { useAccount, useWaitForTransactionReceipt } from "wagmi"
import { getAddress, isAddress, type Address } from "viem"
import { BriefcaseBusiness, ChevronRight, Plus, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LottieAnimation } from "@/components/ui/lottie-animation"
import { useUserPayrolls } from "@/hooks/use-user-payrolls"
import { useIncomingWorkerMigrations } from "@/hooks/use-incoming-worker-migrations"
import { useWorkerEnrollments } from "@/hooks/use-worker-enrollments"
import { usePayrollWrite } from "@/hooks/use-payroll-write"
import { getFactoryContractConfig } from "@/lib/payroll-contract"
import {
  getAdminDashboardPath,
  getLastOpenedPayroll,
  getLastWorkerPayroll,
  getWorkerDashboardPath,
  rememberLastOpenedPayroll,
  rememberLastWorkerPayroll,
} from "@/lib/payroll-routing"
import { getTransactionToastDescription } from "@/lib/transaction-links"
import { toast } from "sonner"

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export default function DashboardIndexPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const normalizedAddress = useMemo(() => (address ? getAddress(address) : undefined), [address])
  const factory = getFactoryContractConfig()
  const { data: payrolls = [], isLoading, refetch } = useUserPayrolls()
  const { data: incomingMigrations = [], isLoading: isLoadingIncomingMigrations } = useIncomingWorkerMigrations()
  const { data: enrollments = [], isLoading: isLoadingEnrollments } = useWorkerEnrollments(normalizedAddress)
  const { writeContractAsync, data: hash, isPending: isWalletPending } = usePayrollWrite()
  const receipt = useWaitForTransactionReceipt({ hash })

  const [workerContractInput, setWorkerContractInput] = useState("")

  useEffect(() => {
    if (!normalizedAddress || payrolls.length === 0) return
    const remembered = getLastOpenedPayroll(normalizedAddress)
    const chosen = remembered && payrolls.some((item) => item.address === remembered) ? remembered : payrolls[0].address
    rememberLastOpenedPayroll(normalizedAddress, chosen)
  }, [normalizedAddress, payrolls])

  useEffect(() => {
    if (!receipt.isSuccess || !normalizedAddress) return
    void refetch()
  }, [normalizedAddress, receipt.isSuccess, refetch])

  async function deployPayroll() {
    if (!factory || !normalizedAddress) return

    try {
      const nextHash = await writeContractAsync({
        ...factory,
        functionName: "deployPayroll",
        args: [normalizedAddress],
      })
      toast.success("Payroll deployment submitted", {
        description: getTransactionToastDescription(factory.chainId, nextHash),
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Deployment failed."
      toast.error("Deploy payroll", { description: message })
    }
  }

  function openOwnedPayroll(contractAddress: Address) {
    if (!normalizedAddress) return
    rememberLastOpenedPayroll(normalizedAddress, contractAddress)
    router.push(getAdminDashboardPath(contractAddress))
  }

  function openWorkerPayroll() {
    if (!isAddress(workerContractInput.trim())) {
      toast.error("Worker access", { description: "Enter a valid payroll contract address." })
      return
    }

    const contractAddress = getAddress(workerContractInput.trim())
    if (normalizedAddress) {
      rememberLastWorkerPayroll(normalizedAddress, contractAddress)
    }
    router.push(getWorkerDashboardPath(contractAddress))
  }

  function openIncomingMigration(contractAddress: Address) {
    if (normalizedAddress) {
      rememberLastWorkerPayroll(normalizedAddress, contractAddress)
    }
    router.push(getWorkerDashboardPath(contractAddress))
  }

  const rememberedWorkerPayroll = normalizedAddress ? getLastWorkerPayroll(normalizedAddress) : undefined

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-4 py-16 sm:px-6">
      {!isConnected ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">Connect your wallet</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Open a payroll you own, deploy a new one, or enter a contract address to access the worker view.
          </p>
          <div className="mt-10">
            <ConnectButton />
          </div>
        </div>
      ) : isLoading || isLoadingIncomingMigrations || isLoadingEnrollments ? (
        <div className="py-28 text-center">
          <LottieAnimation className="mx-auto h-40 w-40" />
          <p className="mt-4 text-sm text-muted-foreground animate-pulse">Loading…</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Payroll</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Where do you want to go?</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Open a payroll, deploy a new one, or paste a contract address to open the worker view.
            </p>
          </div>

          {incomingMigrations.length > 0 ? (
            <Card className="rounded-[28px] border-amber-200 bg-amber-50/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-amber-950">Pending worker migration</CardTitle>
                <CardDescription className="text-amber-900/80">
                  You have a pending wallet migration. Open the payroll below to accept it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {incomingMigrations.map((migration, index) => (
                  <button
                    key={`${migration.payrollAddress}-${migration.oldAddress}-${index}`}
                    type="button"
                    onClick={() => openIncomingMigration(migration.payrollAddress)}
                    className="flex w-full flex-col gap-3 rounded-2xl border border-amber-200 bg-white/80 px-4 py-4 text-left transition hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-amber-950">Wallet migration pending</p>
                      <p className="mt-1 text-xs text-amber-900/80">From worker {shortAddress(migration.oldAddress)}</p>
                      <p className="mt-1 truncate font-mono text-xs text-amber-900/70">{migration.payrollAddress}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                      Open payroll
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {payrolls.length > 0 ? (
            <Card className="rounded-[28px] border-border/70">
              <CardHeader>
                <CardTitle>Your payroll contracts</CardTitle>
                <CardDescription>
                  Sorted by most recent deployment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {payrolls.map((payroll, index) => (
                  <button
                    key={`${payroll.address}-${index}`}
                    type="button"
                    onClick={() => openOwnedPayroll(payroll.address)}
                    className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background px-4 py-4 text-left transition hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{shortAddress(payroll.address)}</p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{payroll.address}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-[28px] border-border/70">
              <CardHeader>
                <CardTitle>No payrolls found</CardTitle>
                <CardDescription>
                  Nothing deployed from this wallet yet.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-[28px] border-border/70">
              <CardHeader>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                <CardTitle className="pt-3">Create payroll</CardTitle>
                <CardDescription>
                  Deploy a payroll contract on Hoodi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Treasury</p>
                  <p>Workers</p>
                  <p>Owner-controlled</p>
                </div>
                <Button className="w-full rounded-xl" disabled={!factory || isWalletPending} onClick={() => void deployPayroll()}>
                  {isWalletPending ? "Deploying..." : "Deploy payroll"}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-border/70">
              <CardHeader>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <CardTitle className="pt-3">Access as worker</CardTitle>
                <CardDescription>
                  {enrollments.length > 0
                    ? "You're enrolled in these payrolls."
                    : "Paste a contract address to open the worker view."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {enrollments.length > 0 ? (
                  <div className="space-y-2">
                    {enrollments.map((enrollment) => (
                      <button
                        key={`${enrollment.contractAddress}-${enrollment.chainId}`}
                        type="button"
                        onClick={() => {
                          if (normalizedAddress) rememberLastWorkerPayroll(normalizedAddress, enrollment.contractAddress)
                          router.push(getWorkerDashboardPath(enrollment.contractAddress))
                        }}
                        className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background px-4 py-4 text-left transition hover:bg-amber-50/50"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{shortAddress(enrollment.contractAddress)}</p>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{enrollment.contractAddress}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </button>
                    ))}
                    <p className="pt-1 text-xs text-muted-foreground">Not listed? Enter an address.</p>
                    <Input
                      value={workerContractInput}
                      onChange={(event) => setWorkerContractInput(event.target.value)}
                      placeholder="0x..."
                      className="font-mono"
                    />
                    <Button variant="outline" className="w-full rounded-xl" onClick={openWorkerPayroll}>
                      Open by address
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={workerContractInput}
                      onChange={(event) => setWorkerContractInput(event.target.value)}
                      placeholder="0x..."
                      className="font-mono"
                    />
                    <Button variant="outline" className="w-full rounded-xl" onClick={openWorkerPayroll}>
                      Open worker dashboard
                    </Button>
                    {rememberedWorkerPayroll ? (
                      <Button
                        variant="ghost"
                        className="w-full rounded-xl"
                        onClick={() => router.push(getWorkerDashboardPath(rememberedWorkerPayroll))}
                      >
                        Reopen last payroll
                      </Button>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
