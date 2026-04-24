"use client"

import { useState } from "react"
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard"
import { AdminDashboard } from "@/components/dashboard/admin-dashboard"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"

export default function DashboardPage() {
  const [view, setView] = useState<"worker" | "admin">("worker")

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader view={view} onViewChange={setView} />
      <main className="container mx-auto px-4 py-8">
        {view === "worker" ? <WorkerDashboard /> : <AdminDashboard />}
      </main>
    </div>
  )
}
