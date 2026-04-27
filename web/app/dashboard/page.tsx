"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { getDashboardPathForRole } from "@/lib/dashboard-role"

export default function DashboardIndexPage() {
  const { role, isConnected, isLoading } = usePayrollRole()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!isConnected) return
    router.replace(getDashboardPathForRole(role))
  }, [isConnected, isLoading, role, router])

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground">
      {isLoading ? "Checking wallet permissions…" : isConnected ? "Opening dashboard…" : "Connect a wallet to continue."}
    </div>
  )
}
