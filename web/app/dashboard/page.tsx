"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { getDashboardPathForRole } from "@/lib/dashboard-role"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Wallet } from "lucide-react"

export default function DashboardIndexPage() {
  const { role, isConnected, isLoading } = usePayrollRole()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!isConnected) return
    router.replace(getDashboardPathForRole(role))
  }, [isConnected, isLoading, role, router])

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-32 text-center">
      {isLoading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Checking wallet permissions…</p>
      ) : isConnected ? (
        <p className="text-sm text-muted-foreground">Opening dashboard…</p>
      ) : (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
            Welcome to StreamWage
          </h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Connect your wallet to access your payroll dashboard, manage workers, or claim your streaming earnings.
          </p>
          <div className="mt-10">
            <ConnectButton />
          </div>
        </>
      )}
    </div>
  )
}
