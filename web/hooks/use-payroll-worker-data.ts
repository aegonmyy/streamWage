"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAccount, usePublicClient, useWatchContractEvent } from "wagmi"
import { getAddress, type Address } from "viem"
import { getPayrollContractConfig, payrollAbi } from "@/lib/payroll-contract"
import {
  formatDuration,
  formatEth,
  formatRate,
  formatTimeline,
  type PayrollTimeline,
} from "@/hooks/use-payroll-admin-data"

type PendingTermsResult = readonly [boolean, number, bigint, bigint, boolean, bigint]
type PendingMigrationResult = readonly [boolean, Address]
type WorkerResult = readonly [boolean, boolean, number, bigint, bigint, bigint, bigint, bigint, string]

export type WorkerDashboardData = {
  address: Address
  exists: boolean
  active: boolean
  timeline: PayrollTimeline
  amountPerIntervalWei: bigint
  intervalSeconds: bigint
  accruedWei: bigint
  totalClaimedWei: bigint
  claimableWei: bigint
  runwaySeconds: bigint
  metadata: string
  pendingProposal: {
    timeline: PayrollTimeline
    amountPerIntervalWei: bigint
    intervalSeconds: bigint
    terminateOnReject: boolean
    expiryTimestamp: bigint
  } | null
  pendingMigration: {
    exists: boolean
    newAddress: Address
  } | null
}

const QUERY_KEY = ["payroll-worker"]

function timelineLabel(value: number): PayrollTimeline {
  if (value === 0) return "Hourly"
  if (value === 1) return "Monthly"
  if (value === 2) return "Custom"
  return "Trigger"
}

export function usePayrollWorkerData() {
  const contract = getPayrollContractConfig()
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: contract?.chainId })
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [...QUERY_KEY, address],
    enabled: !!contract && !!publicClient && !!address,
    queryFn: async (): Promise<WorkerDashboardData> => {
      if (!contract || !publicClient || !address) {
        throw new Error("Wallet and payroll contract are required.")
      }

      const results = await publicClient.multicall({
        contracts: [
          { ...contract, functionName: "workers", args: [address] },
          { ...contract, functionName: "claimable", args: [address] },
          { ...contract, functionName: "workerRunway", args: [address] },
          { ...contract, functionName: "pendingTerms", args: [address] },
          { ...contract, functionName: "pendingMigrations", args: [address] },
        ],
      })

      const workerResult = results[0]
      const claimableResult = results[1]
      const runwayResult = results[2]
      const pendingTermsResult = results[3]
      const pendingMigrationResult = results[4]

      if (
        workerResult.status !== "success" ||
        claimableResult.status !== "success" ||
        runwayResult.status !== "success" ||
        pendingTermsResult.status !== "success" ||
        pendingMigrationResult.status !== "success"
      ) {
        throw new Error("Failed to read worker state.")
      }

      const worker = workerResult.result as WorkerResult
      const pendingTerms = pendingTermsResult.result as PendingTermsResult
      const pendingMigration = pendingMigrationResult.result as PendingMigrationResult

      return {
        address,
        exists: worker[0],
        active: worker[1],
        timeline: timelineLabel(Number(worker[2])),
        amountPerIntervalWei: worker[3],
        intervalSeconds: worker[4],
        accruedWei: worker[5],
        totalClaimedWei: worker[6],
        claimableWei: claimableResult.result as bigint,
        runwaySeconds: runwayResult.result as bigint,
        metadata: worker[8],
        pendingProposal: pendingTerms[0]
          ? {
              timeline: timelineLabel(Number(pendingTerms[1])),
              amountPerIntervalWei: pendingTerms[2],
              intervalSeconds: pendingTerms[3],
              terminateOnReject: pendingTerms[4],
              expiryTimestamp: pendingTerms[5],
            }
          : null,
        pendingMigration: pendingMigration[0]
          ? {
              exists: true,
              newAddress: getAddress(pendingMigration[1]),
            }
          : null,
      }
    },
    staleTime: 15_000,
  })

  useWatchContractEvent({
    address: contract?.address,
    abi: payrollAbi,
    chainId: contract?.chainId,
    enabled: !!contract && !!address,
    onLogs: () => {
      void queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, address] })
    },
  })

  useEffect(() => {
    if (!address) return
    void queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, address] })
  }, [address, contract?.address, contract?.chainId, queryClient])

  return query
}

export { formatDuration, formatEth, formatRate, formatTimeline }
