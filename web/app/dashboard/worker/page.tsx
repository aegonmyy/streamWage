"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard"
import { usePayrollRole } from "@/hooks/use-payroll-role"

export default function WorkerDashboardPage() {
  const { isConnected, isLoading } = usePayrollRole()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!isConnected) {
      router.replace("/dashboard")
    }
  }, [isConnected, isLoading, router])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground">
        Checking wallet permissions…
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground">
        Redirecting…
      </div>
    )
  }

  return <WorkerDashboard />
}
