"use client"

import { Suspense } from "react"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"
import { LottieAnimation } from "@/components/ui/lottie-animation"

export default function PayrollAdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[80vh] items-center justify-center">
          <div className="space-y-4 text-center">
            <LottieAnimation className="mx-auto h-40 w-40" />
            <p className="text-sm font-medium text-muted-foreground">Loading admin dashboard...</p>
          </div>
        </div>
      }
    >
      <AdminDashboard />
    </Suspense>
  )
}
