"use client"

import Link from "next/link"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Zap, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { cn } from "@/lib/utils"

interface DashboardHeaderProps {
  view: "worker" | "admin"
}

export function DashboardHeader({ view }: DashboardHeaderProps) {
  const { isAdmin, isConnected } = usePayrollRole()
  const canUseAdmin = !isConnected || isAdmin

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all sm:px-4",
      active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    )

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Zap className="h-4 w-4" aria-hidden />
          </div>
          <span className="truncate text-lg font-semibold tracking-tight text-foreground">StreamWage</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Dashboard view">
            <Link href="/dashboard/worker" className={tabClass(view === "worker")} role="tab" aria-selected={view === "worker"}>
              Worker
            </Link>
            {canUseAdmin ? (
              <Link href="/dashboard/admin" className={tabClass(view === "admin")} role="tab" aria-selected={view === "admin"}>
                Admin
              </Link>
            ) : (
              <span
                className={cn(tabClass(false), "cursor-not-allowed opacity-50")}
                role="tab"
                aria-selected={false}
                title="This wallet is not configured as a payroll operator"
              >
                Admin
              </span>
            )}
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

              return (
                <div
                  className="flex shrink-0 items-center gap-2"
                  {...(!ready && {
                    "aria-hidden": true,
                    style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
                  })}
                >
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
