"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  ArrowUpRight, 
  Clock, 
  TrendingUp, 
  Wallet,
  ArrowRightLeft,
  Copy,
  Check
} from "lucide-react"

// Mock data - would come from contract
const MOCK_WORKER = {
  address: "0x7a3B...f92d",
  timeline: "Hourly",
  amountPerInterval: "0.05",
  intervalSeconds: 3600,
  accruedWei: "150000000000000000", // 0.15 ETH
  totalClaimed: "2.45",
  lastAccruedAt: Date.now() - 1800000, // 30 mins ago
  active: true,
  metadata: "Senior Developer"
}

export function WorkerDashboard() {
  const [claimable, setClaimable] = useState(0.15)
  const [isClaiming, setIsClaiming] = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const [newAddress, setNewAddress] = useState("")
  const [copied, setCopied] = useState(false)

  // Simulate real-time accrual
  useEffect(() => {
    const interval = setInterval(() => {
      setClaimable(prev => prev + 0.00001389) // ~0.05 ETH/hour
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleClaim = async () => {
    setIsClaiming(true)
    // Would call contract here
    await new Promise(r => setTimeout(r, 2000))
    setClaimable(0)
    setIsClaiming(false)
  }

  const copyAddress = () => {
    navigator.clipboard.writeText("0x7a3B4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f92d")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Worker Dashboard</h1>
        <p className="text-muted-foreground mt-1">View your earnings and claim your wages</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription>Available to Claim</CardDescription>
            <CardTitle className="text-4xl font-mono text-primary">
              {claimable.toFixed(8)} <span className="text-lg text-muted-foreground">ETH</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span>Accruing in real-time</span>
              <span className="text-xs">({MOCK_WORKER.amountPerInterval} ETH/hour)</span>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={handleClaim} 
                disabled={isClaiming || claimable === 0}
                className="gap-2"
              >
                {isClaiming ? (
                  <>Claiming...</>
                ) : (
                  <>
                    <ArrowUpRight className="h-4 w-4" />
                    Claim to Wallet
                  </>
                )}
              </Button>
              <Button variant="outline" className="gap-2">
                <Wallet className="h-4 w-4" />
                Claim to Address
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Claimed</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {MOCK_WORKER.totalClaimed} <span className="text-sm text-muted-foreground">ETH</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span>Lifetime earnings</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payroll Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Status</span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Active
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Timeline</span>
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {MOCK_WORKER.timeline}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Rate</span>
              <span className="font-mono">{MOCK_WORKER.amountPerInterval} ETH/hr</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Role</span>
              <span>{MOCK_WORKER.metadata}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Address</span>
              <button 
                onClick={copyAddress}
                className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors"
              >
                {MOCK_WORKER.address}
                {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Address Migration</CardTitle>
            <CardDescription>
              Transfer your worker profile to a new wallet address
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showMigration ? (
              <Button 
                variant="outline" 
                className="w-full gap-2"
                onClick={() => setShowMigration(true)}
              >
                <ArrowRightLeft className="h-4 w-4" />
                Initiate Migration
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">New Wallet Address</label>
                  <Input 
                    placeholder="0x..." 
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The new address must accept the migration to complete the transfer. 
                  Your accrued balance and history will be preserved.
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowMigration(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    disabled={!newAddress.startsWith("0x")}
                    className="flex-1"
                  >
                    Propose Migration
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
