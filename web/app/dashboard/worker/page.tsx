"use client"

import { useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { LottieAnimation } from "@/components/ui/lottie-animation"

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
        <LottieAnimation className="h-40 w-40 mx-auto" />
        <p className="mt-4 animate-pulse">Checking wallet permissions…</p>
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

  return (
    <Suspense fallback={
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <LottieAnimation className="h-40 w-40 mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Loading worker dashboard...</p>
        </div>
      </div>
    }>
      <WorkerDashboard />
    </Suspense>
  )
}
