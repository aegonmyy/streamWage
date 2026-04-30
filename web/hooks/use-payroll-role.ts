"use client"

import { useMemo } from "react"
import { useAccount, useReadContracts } from "wagmi"
import { getAddress, isAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { type DashboardRole } from "@/lib/dashboard-role"
import { getPayrollContractConfig } from "@/lib/payroll-contract"

export function usePayrollRole() {
  const { address: realAddress, isConnected: realIsConnected } = useAccount()
  const contract = getPayrollContractConfig()

  const isAuthEnabled = process.env.NEXT_PUBLIC_IS_AUTH_ENABLED !== "false"
  const isDevMode = 
    process.env.NEXT_PUBLIC_DEV_MODE === "true" || 
    process.env.DEV_MODE === "true" ||
    !isAuthEnabled
  
  if (typeof window !== "undefined" && !isAuthEnabled) {
    console.log("StreamWage Auth: Disabled")
  }
  
  const devPrivateKey = process.env.NEXT_PUBLIC_DEV_PRIVATE_KEY || process.env.DEV_PRIVATE_KEY
  
  const devAddress = useMemo(() => {
    if (!isDevMode || !devPrivateKey) return undefined
    try {
      return privateKeyToAccount(devPrivateKey as `0x${string}`).address
    } catch {
      return undefined
    }
  }, [isDevMode, devPrivateKey])

  const isConnected = realIsConnected || isDevMode
  const address = realAddress || devAddress

  const normalizedAddress = useMemo(() => {
    if (!address || !isAddress(address)) return undefined
    return getAddress(address)
  }, [address])

  const reads = useMemo(() => {
    if (!contract || !normalizedAddress) return []
    return [
      {
        ...contract,
        functionName: "owner" as const,
      },
      {
        ...contract,
        functionName: "admins" as const,
        args: [normalizedAddress] as const,
      },
    ]
  }, [contract, normalizedAddress])

  const query = useReadContracts({
    contracts: reads,
    query: {
      enabled: !!contract && !!normalizedAddress,
    },
  })

  const owner = query.data?.[0]?.result
  const isOperator = query.data?.[1]?.result === true
  const isOwner =
    typeof owner === "string" && normalizedAddress ? getAddress(owner) === normalizedAddress : false

  const role: DashboardRole = isDevMode || (isConnected && normalizedAddress && (isOwner || isOperator)) ? "admin" : "worker"

  return {
    address: normalizedAddress,
    isConnected,
    role,
    isAdmin: role === "admin",
    isDevMode,
    isLoading: isConnected && !!normalizedAddress && !!contract && query.isLoading,
    isError: query.isError,
    isConfigured: !!contract,
    contractAddress: contract?.address,
    chainId: contract?.chainId,
  }
}
