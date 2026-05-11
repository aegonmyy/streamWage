"use client"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"

export function DashboardShell({ children }: { children: React.ReactNode }) {


  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <DashboardHeader />
      <div className="flex min-h-screen pt-0 md:pt-16">
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
