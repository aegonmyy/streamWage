export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Fund Treasury",
      description: "Deposit ETH into your organization's treasury. This prefunds all worker payments.",
    },
    {
      number: "02",
      title: "Add Workers",
      description: "Register workers with their wallet address, payment timeline, and compensation rate.",
    },
    {
      number: "03",
      title: "Earnings Accrue",
      description: "Workers accumulate earnings in real-time based on their configured timeline.",
    },
    {
      number: "04",
      title: "Claim Anytime",
      description: "Workers pull their earnings whenever they want. No approvals, no delays.",
    },
  ]

  return (
    <section id="how-it-works" className="border-t border-border bg-card/30 py-20 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Four simple steps to streaming payroll on-chain.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="absolute right-0 top-6 hidden h-px w-full translate-x-1/2 bg-border lg:block" />
              )}
              
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary bg-background text-sm font-mono text-primary">
                  {step.number}
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
