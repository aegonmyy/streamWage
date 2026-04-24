import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Play } from "lucide-react"

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-32">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-muted-foreground">Live on Ethereum Mainnet</span>
          </div>

          {/* Headline */}
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-6xl">
            Payroll that flows,{" "}
            <span className="text-primary">not waits</span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
            Prefunded ETH payroll protocol with real-time streaming wages. 
            Workers claim when they want, not when you decide.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="gap-2" asChild>
              <Link href="/dashboard">
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="gap-2">
              <Play className="h-4 w-4" />
              Watch Demo
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 border-t border-border pt-10">
            <div>
              <div className="text-2xl font-bold md:text-3xl">$2.4M</div>
              <div className="mt-1 text-sm text-muted-foreground">Total Streamed</div>
            </div>
            <div>
              <div className="text-2xl font-bold md:text-3xl">1,200+</div>
              <div className="mt-1 text-sm text-muted-foreground">Active Workers</div>
            </div>
            <div>
              <div className="text-2xl font-bold md:text-3xl">48</div>
              <div className="mt-1 text-sm text-muted-foreground">Organizations</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
