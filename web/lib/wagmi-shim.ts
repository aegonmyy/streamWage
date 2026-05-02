"use client"

import { useEthersAuth } from "@/hooks/use-ethers-auth"

// This is a shim to prevent the app from crashing after WagmiProvider was removed.
// It redirects basic calls to our new Ethers/Mock logic.

export function useAccount() {
  const { address, isConnected } = useEthersAuth()
  return { address, isConnected, isConnecting: false, isDisconnected: !isConnected }
}

export function useWriteContract() {
  return {
    writeContractAsync: async () => {
      console.log("Mock Write: Contract writes are disabled in this view-only mode.")
      return "0xmockhash"
    },
    isPending: false,
    isSuccess: false,
    error: null
  }
}

export function useSignMessage() {
  return {
    signMessageAsync: async ({ message }: { message: string }) => {
      console.log("Mock Sign: Message signature bypassed in dev mode.")
      return "0xmocksignature"
    },
    isPending: false,
    isSuccess: false,
    error: null,
    reset: () => {}
  }
}

export function useReadContract() {
  return { data: null, isLoading: false, error: null }
}

export function useReadContracts() {
  return { data: [], isLoading: false, error: null }
}

export function useWaitForTransactionReceipt() {
  return { isLoading: false, isSuccess: true }
}

export function usePublicClient() {
  return null
}

export function useWatchContractEvent() {
  return null
}

export function useConfig() {
  return {}
}
