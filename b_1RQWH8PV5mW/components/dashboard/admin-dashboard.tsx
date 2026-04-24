"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Plus, 
  Wallet,
  Users,
  Clock,
  AlertTriangle,
  TrendingDown,
  Pause,
  Play,
  MoreHorizontal,
  Zap
} from "lucide-react"

// Mock data
const MOCK_WORKERS = [
  { 
    address: "0x7a3B...f92d", 
    name: "Alice Chen", 
    role: "Senior Developer",
    timeline: "Hourly",
    rate: "0.05",
    status: "active",
    accrued: "0.15",
    totalClaimed: "2.45"
  },
  { 
    address: "0x8b4C...e81c", 
    name: "Bob Smith", 
    role: "Designer",
    timeline: "Monthly",
    rate: "2.5",
    status: "active",
    accrued: "1.25",
    totalClaimed: "5.00"
  },
  { 
    address: "0x9c5D...d70b", 
    name: "Carol Davis", 
    role: "Consultant",
    timeline: "Trigger",
    rate: "—",
    status: "active",
    accrued: "0.5",
    totalClaimed: "3.00"
  },
  { 
    address: "0x1a2B...c93e", 
    name: "Dan Wilson", 
    role: "QA Engineer",
    timeline: "Hourly",
    rate: "0.03",
    status: "paused",
    accrued: "0.00",
    totalClaimed: "1.20"
  },
]

const MOCK_TREASURY = {
  balance: "12.5",
  runway: "45", // days
  drainRate: "0.278", // ETH/day
  lowThreshold: 7
}

export function AdminDashboard() {
  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false)
  const [isFundingOpen, setIsFundingOpen] = useState(false)
  const [fundAmount, setFundAmount] = useState("")
  const [triggerWorker, setTriggerWorker] = useState<string | null>(null)
  const [triggerAmount, setTriggerAmount] = useState("")

  const isLowTreasury = parseInt(MOCK_TREASURY.runway) < MOCK_TREASURY.lowThreshold

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage payroll and treasury</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={isFundingOpen} onOpenChange={setIsFundingOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Wallet className="h-4 w-4" />
                Fund Treasury
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Fund Treasury</DialogTitle>
                <DialogDescription>
                  Add ETH to the payroll treasury to fund worker wages.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount (ETH)</label>
                  <Input 
                    type="number"
                    placeholder="0.0"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Current balance: {MOCK_TREASURY.balance} ETH
                </p>
                <Button className="w-full" onClick={() => setIsFundingOpen(false)}>
                  Fund Treasury
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          <Dialog open={isAddWorkerOpen} onOpenChange={setIsAddWorkerOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Worker
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Worker</DialogTitle>
                <DialogDescription>
                  Register a new worker to the payroll protocol.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Wallet Address</label>
                  <Input placeholder="0x..." className="font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Timeline</label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timeline" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="custom">Custom Interval</SelectItem>
                      <SelectItem value="trigger">Trigger-based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount per Interval (ETH)</label>
                  <Input type="number" placeholder="0.0" className="font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Metadata (name, role, etc.)</label>
                  <Input placeholder="Senior Developer" />
                </div>
                <Button className="w-full" onClick={() => setIsAddWorkerOpen(false)}>
                  Add Worker
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className={isLowTreasury ? "border-destructive/50 bg-destructive/5" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              {isLowTreasury && <AlertTriangle className="h-4 w-4 text-destructive" />}
              Treasury Balance
            </CardDescription>
            <CardTitle className="text-2xl font-mono">
              {MOCK_TREASURY.balance} <span className="text-sm text-muted-foreground">ETH</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingDown className="h-4 w-4" />
              <span>-{MOCK_TREASURY.drainRate} ETH/day</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Runway</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {MOCK_TREASURY.runway} <span className="text-sm text-muted-foreground">days</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Until treasury depletes</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Workers</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {MOCK_WORKERS.filter(w => w.status === "active").length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{MOCK_WORKERS.length} total registered</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Accrued</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {MOCK_WORKERS.reduce((sum, w) => sum + parseFloat(w.accrued), 0).toFixed(2)} 
              <span className="text-sm text-muted-foreground"> ETH</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span>Unclaimed wages</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workers</CardTitle>
          <CardDescription>Manage worker payroll configurations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 font-medium text-muted-foreground">Worker</th>
                  <th className="pb-3 font-medium text-muted-foreground">Timeline</th>
                  <th className="pb-3 font-medium text-muted-foreground">Rate</th>
                  <th className="pb-3 font-medium text-muted-foreground">Accrued</th>
                  <th className="pb-3 font-medium text-muted-foreground">Status</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_WORKERS.map((worker) => (
                  <tr key={worker.address} className="border-b border-border last:border-0">
                    <td className="py-4">
                      <div>
                        <div className="font-medium">{worker.name}</div>
                        <div className="text-sm text-muted-foreground font-mono">{worker.address}</div>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {worker.timeline}
                      </div>
                    </td>
                    <td className="py-4 font-mono">
                      {worker.rate !== "—" ? `${worker.rate} ETH` : "—"}
                    </td>
                    <td className="py-4 font-mono">
                      {worker.accrued} ETH
                    </td>
                    <td className="py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        worker.status === "active" 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          worker.status === "active" ? "bg-primary" : "bg-muted-foreground"
                        }`} />
                        {worker.status === "active" ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center justify-end gap-2">
                        {worker.timeline === "Trigger" && (
                          <Dialog open={triggerWorker === worker.address} onOpenChange={(open) => {
                            setTriggerWorker(open ? worker.address : null)
                            if (!open) setTriggerAmount("")
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1.5">
                                <Zap className="h-3 w-3" />
                                Grant
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Grant Trigger Payment</DialogTitle>
                                <DialogDescription>
                                  Grant a one-time payment to {worker.name}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Amount (ETH)</label>
                                  <Input 
                                    type="number"
                                    placeholder="0.0"
                                    value={triggerAmount}
                                    onChange={(e) => setTriggerAmount(e.target.value)}
                                    className="font-mono"
                                  />
                                </div>
                                <Button 
                                  className="w-full" 
                                  onClick={() => setTriggerWorker(null)}
                                >
                                  Grant Payment
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                        <Button variant="ghost" size="sm">
                          {worker.status === "active" ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
