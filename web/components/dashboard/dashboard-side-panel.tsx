"use client"

import { useMemo, useState } from "react"
import { Bell, Zap, ChevronLeft, ChevronRight, CircleHelp, Shield, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface DashboardSidePanelProps {
  view: "worker" | "admin"
}

const workerItems = [
  { label: "Next claim window", value: "Live", hint: "Accrual refreshes every second.", icon: Wallet },
  { label: "Profile status", value: "Active", hint: "Worker record is currently enabled.", icon: BriefcaseBusiness },
  { label: "Need help?", value: "Migration", hint: "Use the migration card to move to a new wallet.", icon: CircleHelp },
]

const adminItems = [
  { label: "Operator scope", value: "Treasury", hint: "Funding, worker setup, and trigger grants.", icon: Shield },
  { label: "Alerts", value: "1 low-runway", hint: "Treasury alerting is mocked for now.", icon: Bell },
  { label: "Next action", value: "Top up", hint: "Refill treasury before the buffer gets tight.", icon: Wallet },
]

export function DashboardSidePanel({ view }: DashboardSidePanelProps) {
  const [isOpen, setIsOpen] = useState(true)

  const content = useMemo(() => {
    return view === "admin"
      ? {
          title: "Admin Rail",
          description: "Quick context and protocol reminders.",
          items: adminItems,
        }
      : {
          title: "Worker Rail",
          description: "Status, shortcuts, and wallet notes.",
          items: workerItems,
        }
  }, [view])

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" size="icon" className="h-11 w-11 rounded-full shadow-lg" aria-label="Open dashboard sidebar">
              {view === "admin" ? <Shield className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[22rem] p-0 sm:max-w-[22rem]">
            <SheetHeader className="border-b border-border/70 p-4 text-left">
              <SheetTitle>{content.title}</SheetTitle>
              <SheetDescription>{content.description}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 overflow-y-auto p-4">
              {content.items.map((item) => {
                const Icon = item.icon
                return (
                  <Card key={item.label} className="border-border/80 shadow-none">
                    <CardHeader className="pb-2">
                      <CardDescription className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </CardDescription>
                      <CardTitle className="text-base">{item.value}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{item.hint}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <aside
        className={cn(
          "sticky top-16 hidden h-[calc(100vh-4rem)] border-r border-border/70 bg-card/70 backdrop-blur md:block",
          isOpen ? "w-[22rem]" : "w-14",
        )}
      >
        <div className="relative flex h-full flex-col">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute top-4 -right-5 z-10 h-10 w-10 rounded-full border-border bg-background shadow-sm"
            onClick={() => setIsOpen((value) => !value)}
            aria-label={isOpen ? "Collapse left sidebar" : "Expand left sidebar"}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>

          <div className={cn("flex h-full flex-col gap-4 overflow-hidden p-4", !isOpen && "items-center px-2 py-4")}>
            <div className={cn("border-b border-border/70 pb-4", !isOpen && "w-full border-b-0 pb-0")}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {view === "admin" ? <Shield className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
                </div>
                {isOpen ? (
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{content.title}</p>
                    <p className="text-xs text-muted-foreground">{content.description}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {isOpen ? (
              <div className="space-y-4 overflow-y-auto pr-1">
                {content.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <Card key={item.label} className="border-border/80 shadow-none">
                      <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </CardDescription>
                        <CardTitle className="text-base">{item.value}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">{item.hint}</p>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-start gap-3 pt-2">
                {content.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.label}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-background text-muted-foreground"
                      title={item.label}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
