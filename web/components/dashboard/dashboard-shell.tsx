"use client"

import { usePathname } from "next/navigation"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const view: "worker" | "admin" = pathname?.includes("/dashboard/admin") ? "admin" : "worker"

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <DashboardHeader view={view} />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
