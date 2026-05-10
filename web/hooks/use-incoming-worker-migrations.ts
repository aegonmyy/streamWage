"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAccount, usePublicClient } from "wagmi"
import { decodeEventLog, getAddress, parseAbiItem, type Address } from "viem"
import {
  buildPayrollContractConfig,
  getFactoryContractConfig,
  getLogsInChunks,
  payrollAbi,
  payrollDeployedEvent,
} from "@/lib/payroll-contract"

export type IncomingWorkerMigration = {
  payrollAddress: Address
  oldAddress: Address
  newAddress: Address
  blockNumber: bigint
  transactionHash: `0x${string}` | null
}

const migrationProposedEvent = parseAbiItem(
  "event MigrationProposed(address indexed oldAddress, address indexed newAddress)"
)

function readMigrationEventArgs(log: { data: `0x${string}`; topics: readonly `0x${string}`[] }) {
  const decoded = decodeEventLog({
    abi: payrollAbi,
    data: log.data,
    topics: log.topics as unknown as [`0x${string}`, ...`0x${string}`[]],
  })

  const args = decoded.args as unknown as { oldAddress: Address; newAddress: Address }
  return {
    oldAddress: getAddress(args.oldAddress),
    newAddress: getAddress(args.newAddress),
  }
}

export function useIncomingWorkerMigrations() {
  const { address } = useAccount()
  const factory = getFactoryContractConfig()
  const publicClient = usePublicClient({ chainId: factory?.chainId })

  const normalizedAddress = useMemo(() => (address ? getAddress(address) : undefined), [address])

  return useQuery({
    queryKey: ["incoming-worker-migrations", normalizedAddress],
    enabled: !!factory && !!publicClient && !!normalizedAddress,
    refetchInterval: 30_000,
    queryFn: async (): Promise<IncomingWorkerMigration[]> => {
      if (!factory || !publicClient || !normalizedAddress) {
        throw new Error("Factory contract is not configured.")
      }

      const factoryLogs = await getLogsInChunks(publicClient, {
        address: factory.address,
        event: payrollDeployedEvent,
        fromBlock: factory.fromBlock,
        toBlock: "latest",
      })

      const payrollAddresses = Array.from(
        new Set(
          factoryLogs.map((log) => {
            const decoded = decodeEventLog({
              abi: factory.abi,
              data: log.data,
              topics: log.topics,
            })
            return getAddress((decoded.args as { payroll: Address }).payroll)
          })
        )
      )

      const migrationLogs = await Promise.all(
        payrollAddresses.map(async (payrollAddress) => {
          const payrollContract = buildPayrollContractConfig(payrollAddress)
          if (!payrollContract) return [] as IncomingWorkerMigration[]

          const logs = await getLogsInChunks(publicClient, {
            address: payrollAddress,
            event: migrationProposedEvent,
            args: { newAddress: normalizedAddress },
            fromBlock: payrollContract.fromBlock,
            toBlock: "latest",
          })

          if (logs.length === 0) return [] as IncomingWorkerMigration[]

          const pendingStates = await publicClient.multicall({
            contracts: logs.map((log) => {
              const args = readMigrationEventArgs(log)
              return {
                ...payrollContract,
                functionName: "pendingMigrations" as const,
                args: [getAddress(args.oldAddress)],
              }
            }),
          })

          return logs.flatMap((log, index) => {
            const args = readMigrationEventArgs(log)
            const pendingState = pendingStates[index]

            if (pendingState.status !== "success") return []

            const [exists, pendingNewAddress] = pendingState.result as readonly [boolean, Address]
            if (!exists || getAddress(pendingNewAddress) !== normalizedAddress) return []

            return [
              {
                payrollAddress,
                oldAddress: getAddress(args.oldAddress),
                newAddress: getAddress(args.newAddress),
                blockNumber: log.blockNumber ?? 0n,
                transactionHash: log.transactionHash ?? null,
              },
            ]
          })
        })
      )

      return migrationLogs
        .flat()
        .sort((left, right) => Number(right.blockNumber - left.blockNumber))
    },
  })
}
