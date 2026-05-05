"use client"

import { Suspense } from "react"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"
import { LottieAnimation } from "@/components/ui/lottie-animation"

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <LottieAnimation className="h-40 w-40 mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Loading admin dashboard...</p>
        </div>
      </div>
    }>
      <AdminDashboard />
    </Suspense>
  )
}
