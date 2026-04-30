"use client"

import { useWriteContract, useAccount, useConfig } from "wagmi"
import { createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { useMemo } from "react"

export function usePayrollWrite() {
  const { writeContractAsync: wagmiWrite, ...rest } = useWriteContract()
  const { isConnected } = useAccount()
  const config = useConfig()

  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"
  const devPrivateKey = process.env.NEXT_PUBLIC_DEV_PRIVATE_KEY

  const writeContractAsync = useMemo(() => {
    return async (args: any) => {
      // Use dev private key if in dev mode and not connected to a real wallet
      if (isDevMode && !isConnected && devPrivateKey) {
        try {
          const account = privateKeyToAccount(devPrivateKey as `0x${string}`)
          const chain = config.chains.find((c) => c.id === args.chainId) || config.chains[0]
          
          const walletClient = createWalletClient({
            account,
            chain,
            transport: http(),
          })

          return await walletClient.writeContract({
            address: args.address,
            abi: args.abi,
            functionName: args.functionName,
            args: args.args,
            value: args.value,
          })
        } catch (error) {
          console.error("Dev mode write failed:", error)
          throw error
        }
      }

      // Fallback to standard wagmi write
      return await wagmiWrite(args)
    }
  }, [isDevMode, isConnected, devPrivateKey, config.chains, wagmiWrite])

  return {
    ...rest,
    writeContractAsync,
  }
}
