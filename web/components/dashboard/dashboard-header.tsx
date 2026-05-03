"use client"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Shield, Zap, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { cn } from "@/lib/utils"

interface DashboardHeaderProps {
  view: "worker" | "admin"
}

export function DashboardHeader({ view }: DashboardHeaderProps) {
  const { isAdmin, isConnected, isLoading } = usePayrollRole()

  const roleLabel = !isConnected ? "Not connected" : isLoading ? "Checking role…" : isAdmin ? "Admin" : "Worker"
  const roleIcon = !isConnected ? Wallet : isAdmin ? Shield : Wallet
  const RoleIcon = roleIcon

  return (
    <header className="sticky top-0 z-50 hidden border-b border-border/60 bg-card md:flex">
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
  )
}
