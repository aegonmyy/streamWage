"use client"

import "@rainbow-me/rainbowkit/styles.css"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit"
import { WagmiProvider } from "wagmi"
import { wagmiConfig } from "@/lib/wagmi"
import { PayrollContractProvider } from "@/lib/payroll-contract"
import { useTheme } from "next-themes"

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()

  const rkTheme = React.useMemo(() => {
    const base = {
      accentColor: "#1814f3",
      accentColorForeground: "#ffffff",
      borderRadius: "large" as const,
      fontStack: "system" as const,
      overlayBlur: "small" as const,
    }

    return resolvedTheme === "dark" ? darkTheme(base) : lightTheme(base)
  }, [resolvedTheme])

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <PayrollContractProvider>{children}</PayrollContractProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
