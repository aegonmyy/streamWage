"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import {
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  Shield,
  Users,
  Wallet,
  Zap,
} from "lucide-react"

import { SidebarProvider, Sidebar, SidebarTrigger, SidebarHeader } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { AdminSignatureGate } from "@/components/dashboard/admin-signature-gate"
import { usePayrollAdminData } from "@/hooks/use-payroll-admin-data"
import { usePayrollRole } from "@/hooks/use-payroll-role"

const SIDEBAR_ITEMS = [
  { id: "overview", label: "Overview", description: "Treasury health and metrics.", icon: LayoutDashboard, href: "/dashboard/admin" },
  { id: "workers", label: "Workers", description: "Manage active roster.", icon: Users, href: "/dashboard/admin?section=workers" },
  { id: "proposals", label: "Proposals", description: "Review pending terms.", icon: Clock3, href: "/dashboard/admin?section=proposals" },
  { id: "treasury", label: "Treasury", description: "Fund and manage capital.", icon: Wallet, href: "/dashboard/admin?section=treasury" },
  { id: "admins", label: "Admins", description: "Access controls.", icon: Shield, href: "/dashboard/admin?section=admins" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data } = usePayrollAdminData()
  const { isAdmin, isConnected, isLoading, isDevMode } = usePayrollRole()

  // Redirect if not admin
  useEffect(() => {
    if (isLoading) return
    if (!isConnected && !isDevMode) {
      router.replace("/dashboard")
    } else if (!isAdmin && !isDevMode) {
      router.replace("/dashboard")
    }
  }, [isAdmin, isConnected, isDevMode, isLoading, router])

  const searchParams = useSearchParams()

  // Determine current section based on query param
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
          <p className="text-sm text-muted-foreground font-medium">Verifying admin permissions...</p>
        </div>
      </div>
    )
  }

  return (
    <AdminSignatureGate>
      <SidebarProvider>
        <div className="relative mx-auto flex w-full max-w-7xl gap-6 px-4 py-8 sm:px-6">
          <Sidebar collapsible="icon" className="xl:sticky xl:top-24 xl:self-start">
            <SidebarTrigger className="absolute -right-3 top-20 z-20 h-8 w-8 rounded-full border border-border bg-card shadow-sm hover:bg-accent transition-all" />
            
            <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card group-data-[collapsible=icon]:w-12 group-data-[collapsible=icon]:rounded-xl transition-all duration-300 shadow-sm">
              <SidebarHeader className="border-b border-border/70 px-5 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Zap className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-semibold text-foreground">Admin Dashboard</p>
                    </div>
                    </div>
                    </SidebarHeader>

              <SidebarNav 
                section={currentSection} 
                setSection={handleSectionChange} 
                items={SIDEBAR_ITEMS}
                highlightMap={{
                  proposals: (Array.isArray(data?.workers) ? data.workers.filter(w => w.pendingProposal).length : 0) > 0,
                }}
              />
            </div>
          </Sidebar>

          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </AdminSignatureGate>
  )
}
