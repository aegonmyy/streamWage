"use client"

import { ShieldCheck, ShieldAlert } from "lucide-react"
import { useAccount } from "wagmi"
import { usePayrollRole } from "@/hooks/use-payroll-role"

interface AdminPageHeaderProps {
  title: string
  subtitle: string
}

export function AdminPageHeader({ title, subtitle }: AdminPageHeaderProps) {
  const { address: connectedAddress } = useAccount()
  const { isOwner } = usePayrollRole()

  const shortenedAddress = connectedAddress 
    ? `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-4)}`
    : "Not connected"

  return (
    <div className="rounded-[32px] border border-border/70 bg-card p-8 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-base text-muted-foreground font-medium">{subtitle}</p>
        </div>
        
        <div className="flex flex-col items-end gap-2 text-right">
          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/50 px-4 py-2 shadow-sm">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
              {isOwner ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            </div>
            <span className="text-sm font-bold text-foreground">{isOwner ? "Owner" : "Admin"}</span>
            <div className="h-4 w-px bg-border/60 mx-1" />
            <span className="font-mono text-xs text-muted-foreground tracking-tight">
              {shortenedAddress}
            </span>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground/50 tracking-widest uppercase font-mono">
            Access resolved from owner() and admins(address)
          </p>
        </div>
      </div>
    </div>
  )
}
