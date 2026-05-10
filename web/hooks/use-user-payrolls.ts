"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAccount, usePublicClient } from "wagmi"
import { decodeEventLog, getAddress, type Address } from "viem"
import {
  getFactoryContractConfig,
  getLogsInChunks,
  payrollDeployedEvent,
} from "@/lib/payroll-contract"

export type DiscoveredPayroll = {
  address: Address
  owner: Address
  deployedBy: Address
  blockNumber: bigint
  transactionHash: `0x${string}` | null
}

export function useUserPayrolls() {
  const { address } = useAccount()
  const factory = getFactoryContractConfig()
  const publicClient = usePublicClient({ chainId: factory?.chainId })

  const normalizedAddress = useMemo(() => (address ? getAddress(address) : undefined), [address])

  return useQuery({
    queryKey: ["user-payrolls", normalizedAddress],
    enabled: !!factory && !!publicClient && !!normalizedAddress,
    queryFn: async (): Promise<DiscoveredPayroll[]> => {
      if (!factory || !publicClient || !normalizedAddress) {
        throw new Error("Factory contract is not configured.")
      }

      const logs = await getLogsInChunks(publicClient, {
        address: factory.address,
        event: payrollDeployedEvent,
        args: { owner: normalizedAddress },
        fromBlock: factory.fromBlock,
        toBlock: "latest",
      })

      const deployments = logs
        .flatMap((log) => {
          let decoded
          try {
            decoded = decodeEventLog({
              abi: factory.abi,
              data: log.data,
              topics: log.topics,
            })
          } catch {
            return []
          }
          const args = decoded.args as {
            payroll: Address
            owner: Address
            deployedBy: Address
          }

          return [
            {
              address: getAddress(args.payroll),
              owner: getAddress(args.owner),
              deployedBy: getAddress(args.deployedBy),
              blockNumber: log.blockNumber ?? 0n,
              transactionHash: log.transactionHash ?? null,
            },
          ]
        })
        .sort((left, right) => Number(right.blockNumber - left.blockNumber))

      return deployments
    },
  })
}
