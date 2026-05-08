"use client"

import "@rainbow-me/rainbowkit/styles.css"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit"
import { WagmiProvider } from "wagmi"
import { wagmiConfig } from "@/lib/wagmi"
import { PayrollContractProvider } from "@/lib/payroll-contract"

const queryClient = new QueryClient()

const rkTheme = lightTheme({
  accentColor: "#1814f3",
  accentColorForeground: "#ffffff",
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small",
})

export function Providers({ children }: { children: React.ReactNode }) {
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
