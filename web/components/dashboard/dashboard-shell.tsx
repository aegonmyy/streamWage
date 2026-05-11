"use client"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { usePathname } from "next/navigation"

export function DashboardShell({ children }: { children: React.ReactNode }) {


  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
     <DashboardHeader />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
