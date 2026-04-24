import { Card, CardContent } from "@/components/ui/card"
import { Clock, Shield, Wallet, Zap, Users, Settings } from "lucide-react"

const features = [
  {
    icon: Clock,
    title: "Flexible Timelines",
    description: "Hourly, monthly, custom intervals, or trigger-based payments. Match any compensation model.",
  },
  {
    icon: Wallet,
    title: "Pull-Based Claims",
    description: "Workers claim earnings on their schedule. No more waiting for payday.",
  },
  {
    icon: Shield,
    title: "Prefunded Security",
    description: "Treasury-backed payments ensure workers always get paid. No empty promises.",
  },
  {
    icon: Zap,
    title: "Real-Time Accrual",
    description: "Watch earnings grow second by second. Full transparency on-chain.",
  },
  {
    icon: Users,
    title: "Multi-Role Access",
    description: "Owner and admin roles for flexible payroll management across your organization.",
  },
  {
    icon: Settings,
    title: "Address Migration",
    description: "Workers can securely migrate to new addresses without losing accrued earnings.",
  },
]

export function Features() {
  return (
    <section id="features" className="py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Built for modern teams
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need to run on-chain payroll, nothing you don&apos;t.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
