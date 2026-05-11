"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import {
  Bell,
  Zap,
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
import { useAccount, useDisconnect } from "wagmi"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { LottieAnimation } from "@/components/ui/lottie-animation"
import { usePayrollContractAddress } from "@/lib/payroll-contract"
import { getWorkerDashboardPath } from "@/lib/payroll-routing"

const SIDEBAR_ITEMS = [
  { id: "overview", label: "Overview", description: "Your claimable balance and status.", icon: LayoutDashboard },
  { id: "earnings", label: "Earnings", description: "Claim funds and review totals.", icon: Wallet },
  { id: "proposals", label: "Proposals", description: "Review and accept terms.", icon: Clock3 },
  { id: "profile", label: "Profile", description: "Wallet and migration tools.", icon: User },
  { id: "support", label: "Support", description: "Help and documentation.", icon: HelpCircle },
  { id: "notifications", label: "Notifications", description: "Slack and Telegram alerts.", icon: Bell },
]

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { data } = usePayrollWorkerData()
  const { isConnected, isLoading, isAdmin } = usePayrollRole()
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const { toast } = useToast()
  const contractAddress = usePayrollContractAddress()

  // Redirect if not connected
  useEffect(() => {
    if (isLoading) return
    if (!isConnected) {
      router.replace("/dashboard")
    }
  }, [isConnected, isLoading, router])

  const searchParams = useSearchParams()
  const currentSection = searchParams.get("section") || "overview"

  const handleSectionChange = (id: string) => {
    if (contractAddress) {
      router.push(getWorkerDashboardPath(contractAddress, id === "overview" ? undefined : id))
    }
  }

  const handleDisconnect = () => {
    disconnect()
    router.push("/dashboard")
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
          <p className="text-sm text-muted-foreground font-medium">Loading worker dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider>
      {/* Mobile Top Bar */}
      <div className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b bg-card px-3 sm:px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Zap className="h-8 w-8 text-amber-500" />
          <div className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            isAdmin ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"
          )}>
            {isAdmin ? "Admin" : "Worker"}
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
            onClick={handleDisconnect}
            aria-label="Disconnect wallet"
            className="p-1 text-red-500 hover:text-red-600 active:scale-95 transition-transform duration-150"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-8 md:flex-row">
        <Sidebar collapsible="icon" className="xl:sticky xl:top-24 xl:self-start">
          <SidebarTrigger className="absolute -right-3 top-20 z-20 h-8 w-8 rounded-full border border-border bg-card shadow-sm hover:bg-accent transition-all" />
          
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

   
       <main className="min-w-0 flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>

     {/* Mobile Bottom Navigation */}
     <div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-stretch border-t bg-card md:hidden">
       {SIDEBAR_ITEMS.map((item) => {
         const Icon = item.icon
         const isActive = currentSection === item.id
         const hasDot = item.id === "proposals" && !!data?.pendingProposal
         return (
           <button
             key={item.id}
             onClick={() => handleSectionChange(item.id)}
             className={cn(
               "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
               isActive ? "text-amber-500" : "text-muted-foreground"
             )}
           >
             <div className="relative">
               <Icon className="h-5 w-5" />
               {hasDot && (
                 <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-500" />
               )}
             </div>
            
           </button>
         )
       })}
     </div>
    </SidebarProvider>
         
  )
}
