"use client"

import { useMemo } from "react"
import { useAccount, useReadContracts } from "wagmi"
import { getAddress, isAddress } from "viem"
import { type DashboardRole } from "@/lib/dashboard-role"
import { usePayrollContractConfig } from "@/lib/payroll-contract"

export function usePayrollRole() {
  const { address, isConnected } = useAccount()
  const contract = usePayrollContractConfig()

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
    typeof owner === "string" && normalizedAddress
      ? getAddress(owner) === normalizedAddress
      : false

  const role: DashboardRole =
    isConnected && normalizedAddress && (isOwner || isOperator) ? "admin" : "worker"

  return {
    address: normalizedAddress,
    isConnected,
    role,
    isAdmin: role === "admin",
    isOwner,
    isLoading: isConnected && !!normalizedAddress && !!contract && query.isLoading,
    isError: query.isError,
    isConfigured: !!contract,
    contractAddress: contract?.address,
    chainId: contract?.chainId,
  }
}
