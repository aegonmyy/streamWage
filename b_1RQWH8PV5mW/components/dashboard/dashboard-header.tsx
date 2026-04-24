"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Wallet, ArrowLeft } from "lucide-react"

interface DashboardHeaderProps {
  view: "worker" | "admin"
  onViewChange: (view: "worker" | "admin") => void
}

export function DashboardHeader({ view, onViewChange }: DashboardHeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">SW</span>
              </div>
              <span className="font-semibold text-foreground">StreamWage</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex rounded-lg bg-secondary p-1">
              <button
                onClick={() => onViewChange("worker")}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  view === "worker"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Worker
              </button>
              <button
                onClick={() => onViewChange("admin")}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  view === "admin"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Admin
              </button>
            </div>

            <Button variant="outline" size="sm" className="gap-2">
              <Wallet className="h-4 w-4" />
              <span className="font-mono text-xs">0x7a3...f92d</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
