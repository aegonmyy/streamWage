"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"
import { AdminSignatureGate } from "@/components/dashboard/admin-signature-gate"
import { usePayrollRole } from "@/hooks/use-payroll-role"

export default function AdminDashboardPage() {
  const { isConnected, isAdmin, isLoading } = usePayrollRole()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!isConnected) {
      router.replace("/dashboard")
      return
    }
    if (!isAdmin) {
      router.replace("/dashboard")
    }
  }, [isAdmin, isConnected, isLoading, router])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground">
        Checking wallet permissions…
      </div>
    )
  }

  if (!isConnected || (isConnected && !isAdmin)) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-muted-foreground">
        Redirecting…
      </div>
    )
  }

  return (
    <AdminSignatureGate>
      <AdminDashboard />
    </AdminSignatureGate>
  )
}
