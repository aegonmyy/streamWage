"use client"

import { usePathname } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { DashboardSidePanel } from "@/components/dashboard/dashboard-side-panel"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const view: "worker" | "admin" = pathname?.includes("/dashboard/admin") ? "admin" : "worker"

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader view={view} />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <main className="min-w-0 flex-1">{children}</main>
        {view === "worker" ? <DashboardSidePanel view={view} /> : null}
      </div>
    </div>
  )
}
