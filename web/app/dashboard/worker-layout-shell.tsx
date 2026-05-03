"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import {
  Zap,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  User,
  Wallet,
  HelpCircle,
} from "lucide-react"

import { SidebarProvider, Sidebar, SidebarTrigger, SidebarHeader } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { usePayrollWorkerData } from "@/hooks/use-payroll-worker-data"
import { usePayrollRole } from "@/hooks/use-payroll-role"

const SIDEBAR_ITEMS = [
  { id: "overview", label: "Overview", description: "Your claimable balance and status.", icon: LayoutDashboard, href: "/dashboard/worker" },
  { id: "earnings", label: "Earnings", description: "Claim funds and review totals.", icon: Wallet, href: "/dashboard/worker?section=earnings" },
  { id: "proposals", label: "Proposals", description: "Review and accept terms.", icon: Clock3, href: "/dashboard/worker?section=proposals" },
  { id: "profile", label: "Profile", description: "Wallet and migration tools.", icon: User, href: "/dashboard/worker?section=profile" },
  { id: "support", label: "Support", description: "Help and documentation.", icon: HelpCircle, href: "/dashboard/worker?section=support" },
]

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data } = usePayrollWorkerData()
  const { isConnected, isLoading, isDevMode } = usePayrollRole()

  // Redirect if not connected
  useEffect(() => {
    if (isLoading) return
    if (!isConnected && !isDevMode) {
      router.replace("/dashboard")
    }
  }, [isConnected, isDevMode, isLoading, router])

  const searchParams = useSearchParams()
  const currentSection = searchParams.get("section") || "overview"

  const handleSectionChange = (id: string) => {
    const item = SIDEBAR_ITEMS.find(i => i.id === id)
    if (item?.href) {
      router.push(item.href)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Loading worker dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <div className="relative mx-auto flex w-full max-w-7xl gap-6 px-4 py-8 sm:px-6">
        <div className="fixed left-0 top-1/2 z-50 -translate-y-1/2">
          <SidebarTrigger className="h-12 w-6 rounded-l-none rounded-r-xl border border-l-0 border-border bg-card shadow-sm hover:bg-accent transition-all">
            <ChevronRight className="h-4 w-4 transition-transform group-data-[state=expanded]:rotate-180" />
          </SidebarTrigger>
        </div>

        <Sidebar collapsible="icon" className="xl:sticky xl:top-24 xl:self-start">
          <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card group-data-[collapsible=icon]:w-12 group-data-[collapsible=icon]:rounded-xl transition-all duration-300 shadow-sm">
            <SidebarHeader className="border-b border-border/70 px-5 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-semibold text-foreground">Worker Dashboard</p>
                </div>
              </div>
            </SidebarHeader>

            <SidebarNav 
              section={currentSection} 
              setSection={handleSectionChange} 
              items={SIDEBAR_ITEMS}
              activeClassName="bg-amber-500/10 text-amber-600"
              highlightMap={{
                proposals: !!data?.pendingProposal,
              }}
            />
          </div>
        </Sidebar>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
