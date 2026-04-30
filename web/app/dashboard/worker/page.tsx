"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard"
import { usePayrollRole } from "@/hooks/use-payroll-role"

export default function WorkerDashboardPage() {
  const { isConnected, isLoading, isDevMode } = usePayrollRole()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!isConnected && !isDevMode) {
      router.replace("/dashboard")
    }
  }, [isConnected, isDevMode, isLoading, router])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground">
        Checking wallet permissions…
      </div>
    )
  }

  if (!isConnected && !isDevMode) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground">
        Redirecting…
      </div>
    )
  }

  return <WorkerDashboard />
}
