"use client"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Shield, Zap, Wallet, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { useReadContract, useAccount, useWaitForTransactionReceipt } from "wagmi"
import { getPayrollContractConfig } from "@/lib/payroll-contract"
import { usePayrollWrite } from "@/hooks/use-payroll-write"
import { toast } from "sonner"
import { getTransactionToastDescription } from "@/lib/transaction-links"
import { cn } from "@/lib/utils"
import { useEffect } from "react"

interface DashboardHeaderProps {
  view: "worker" | "admin"
}

export function DashboardHeader({ view }: DashboardHeaderProps) {
  const { isAdmin, isConnected, isLoading } = usePayrollRole()
  const { address } = useAccount()
  const contract = getPayrollContractConfig()

  const { data: owner } = useReadContract({
    address: contract?.address,
    abi: contract?.abi,
    functionName: 'owner',
  })

  const isOwner = address && owner && address.toLowerCase() === (owner as string).toLowerCase()

  const { writeContractAsync, data: hash, isPending: isWalletPending } = usePayrollWrite()
  const receipt = useWaitForTransactionReceipt({ hash })

  const roleLabel = !isConnected ? "Not connected" : isLoading ? "Checking role…" : isAdmin ? "Admin" : "Worker"
  const roleIcon = !isConnected ? Wallet : isAdmin ? Shield : Wallet
  const RoleIcon = roleIcon

  return (
    <div className="sticky top-0 z-[60] flex flex-col w-full">
      <header className="hidden border-b border-border/60 bg-card md:flex">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Zap className="h-4 w-4" aria-hidden />
            </div>
            <span className="truncate text-lg font-semibold tracking-tight text-foreground">StreamWage</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex">
              <RoleIcon className="h-4 w-4" aria-hidden />
              <span className={cn(isConnected && !isLoading ? "text-foreground" : undefined)}>{roleLabel}</span>
            </div>

            <ConnectButton.Custom>
              {({
                account,
                chain,
                mounted,
                authenticationStatus,
                openAccountModal,
                openChainModal,
                openConnectModal,
              }) => {
                const ready = mounted && authenticationStatus !== "loading"
                const connected =
                  ready &&
                  account &&
                  chain &&
                  (!authenticationStatus || authenticationStatus === "authenticated")

                if (!ready) {
                  return (
                    <div className="flex h-9 w-32 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
                  )
                }

                return (
                  <div className="flex shrink-0 items-center gap-2">
                    {!connected ? (
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-xl px-4 shadow-sm"
                        onClick={openConnectModal}
                      >
                        Connect Wallet
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="sm:hidden">
                          <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled>
                            {roleLabel}
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="hidden gap-2 rounded-xl font-mono text-xs sm:inline-flex"
                          onClick={openChainModal}
                        >
                          {chain.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt={chain.name ?? "Chain"} src={chain.iconUrl} className="h-4 w-4" />
                          ) : null}
                          {chain.name}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2 rounded-xl font-mono text-xs shadow-sm"
                          onClick={openAccountModal}
                        >
                          <Wallet className="h-4 w-4 shrink-0" />
                          {account.displayName}
                        </Button>
                      </div>
                    )}
                  </div>
                )
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </header>
    </div>
  )
}
