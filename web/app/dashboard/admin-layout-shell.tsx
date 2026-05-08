"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import {
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  Shield,
  Users,
  Wallet,
  Zap,
  Menu,
  X,
  LogOut,
} from "lucide-react"

import { SidebarProvider, Sidebar, SidebarTrigger, SidebarHeader } from "@/components/ui/sidebar"
import { SidebarNav } from "@/components/dashboard/sidebar-nav"
import { AdminSignatureGate } from "@/components/dashboard/admin-signature-gate"
import { usePayrollAdminData } from "@/hooks/use-payroll-admin-data"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { useAccount, useDisconnect } from "wagmi"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { LottieAnimation } from "@/components/ui/lottie-animation"
import { usePayrollContractAddress } from "@/lib/payroll-contract"
import { getAdminDashboardPath } from "@/lib/payroll-routing"

const SIDEBAR_ITEMS = [
  { id: "overview", label: "Overview", description: "Treasury health and metrics.", icon: LayoutDashboard },
  { id: "workers", label: "Workers", description: "Manage active roster.", icon: Users },
  { id: "proposals", label: "Proposals", description: "Review pending terms.", icon: Clock3 },
  { id: "treasury", label: "Treasury", description: "Fund and manage capital.", icon: Wallet },
  { id: "admins", label: "Admins", description: "Access controls.", icon: Shield },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data } = usePayrollAdminData()
  const { isAdmin, isConnected, isLoading, isDevMode } = usePayrollRole()
  const { address } = useAccount()
  const contractAddress = usePayrollContractAddress()
  const { disconnect } = useDisconnect()
  const { toast } = useToast()

  const [isNavOpen, setIsNavOpen] = useState(false)

  // Redirect if not admin
  useEffect(() => {
    if (isLoading) return
    if (!isConnected && !isDevMode) {
      router.replace("/dashboard")
    } else if (!isAdmin && !isDevMode) {
      router.replace("/dashboard")
    }
  }, [isAdmin, isConnected, isDevMode, isLoading, router])

  // Prevent background scroll when nav is open
  useEffect(() => {
    if (isNavOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isNavOpen])

  const searchParams = useSearchParams()

  // Determine current section based on query param
  const currentSection = searchParams.get("section") || "overview"

  const handleSectionChange = (id: string) => {
    if (contractAddress) {
      router.push(getAdminDashboardPath(contractAddress, id === "overview" ? undefined : id))
      setIsNavOpen(false)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    router.push("/dashboard")
    setIsNavOpen(false)
  }

  const formatAddress = (addr?: string) => {
    if (!addr) return ""
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      toast({
        title: "Copied!",
        description: "Address copied to clipboard",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center space-y-4">
          <LottieAnimation className="h-40 w-40 mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">Verifying admin permissions...</p>
        </div>
      </div>
    )
  }

  const hasPendingProposals = (Array.isArray(data?.workers) ? data.workers.filter(w => w.pendingProposal).length : 0) > 0

  return (
    <AdminSignatureGate>
      <SidebarProvider>
        {/* Mobile Top Bar */}
        <div className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b bg-card px-3 sm:px-4 md:hidden">
          <div className="flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            <div className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600">
              Admin
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={copyAddress}
              className="max-w-[7.5rem] truncate rounded-md bg-muted px-2 py-1 font-mono text-xs hover:bg-muted/80 active:scale-95 transition-transform"
            >
              {formatAddress(address)}
            </button>
            
            <button 
              onClick={() => setIsNavOpen(!isNavOpen)}
              className={cn(
                "relative z-50 p-1 transition-transform duration-200",
                isNavOpen && "rotate-90"
              )}
            >
              {isNavOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        <div className={cn(
          "fixed inset-0 z-30 md:hidden transition-opacity duration-200",
          isNavOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}>
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            onClick={() => setIsNavOpen(false)}
          />
          <div className={cn(
            "absolute top-14 left-0 w-full bg-card border-b shadow-xl transition-all duration-250 ease-in-out",
            isNavOpen ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
          )}>
            <nav className="flex flex-col p-2">
              {SIDEBAR_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = currentSection === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id)}
                    className={cn(
                      "flex h-12 w-full items-center justify-between rounded-lg px-4 transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5" />
                      <span className="font-medium">{item.label}</span>
                      {item.id === "proposals" && hasPendingProposals && (
                        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-50" />
                  </button>
                )
              })}
              
              <div className="my-2 border-t" />
              
              <button
                onClick={handleDisconnect}
                className="flex h-12 w-full items-center gap-3 rounded-lg px-4 text-red-500 hover:bg-red-500/5 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                <span className="font-medium">Disconnect</span>
              </button>
            </nav>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-8 md:flex-row">
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
                  proposals: hasPendingProposals,
                }}
              />
            </div>
          </Sidebar>

          <main className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </AdminSignatureGate>
  )
}
