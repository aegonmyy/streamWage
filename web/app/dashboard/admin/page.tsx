"use client"

import { Suspense } from "react"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Loading admin dashboard...</p>
        </div>
      </div>
    }>
      <AdminDashboard />
    </Suspense>
  )
}
