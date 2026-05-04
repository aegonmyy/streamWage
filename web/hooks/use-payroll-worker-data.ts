"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAccount, usePublicClient } from "wagmi"
import { decodeEventLog, getAddress, type Address } from "viem"
import { getPayrollContractConfig, payrollAbi, getLogsInChunks, getPayrollEventLookbackBlocks } from "@/lib/payroll-contract"
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

export type WorkerActivityItem = {
  id: string
  title: string
  detail: string
  timestamp: bigint | null
  tone: "default" | "warning"
  txHash: `0x${string}` | null
  actionLabel: string
}

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
    proposalNote: string
  } | null
  pendingMigration: {
    exists: boolean
    newAddress: Address
  } | null
  incomingMigrationRequests: Address[]
  recentActivity: WorkerActivityItem[]
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
    refetchInterval: 30_000, // Poll every 30s instead of using eth_newFilter
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
      const currentBlock = await publicClient.getBlockNumber()
      const lookbackBlocks = getPayrollEventLookbackBlocks()
      const recentFromBlock =
        currentBlock > lookbackBlocks
          ? (currentBlock - lookbackBlocks > contract.fromBlock ? currentBlock - lookbackBlocks : contract.fromBlock)
          : contract.fromBlock

      const logs = await getLogsInChunks(publicClient, {
        address: contract.address,
        fromBlock: recentFromBlock,
        toBlock: currentBlock,
      })

      const incomingCandidates = new Set<Address>()
      const recentActivity: WorkerActivityItem[] = []
      let latestProposalNote = ""
      
      for (const log of logs) {
        let decoded
        try {
          decoded = decodeEventLog({
            abi: payrollAbi,
            data: log.data,
            topics: log.topics,
          })
        } catch {
          continue
        }
        const args = decoded.args as any

        if (decoded.eventName === "Claimed" && getAddress(args.worker) === address) {
          recentActivity.push({
            id: `${log.transactionHash}-${log.logIndex}`,
            title: "Claim processed",
            detail: `${formatEth(args.amount)} ETH sent to ${getAddress(args.recipient)}`,
            timestamp: log.blockNumber ?? null,
            tone: "default",
            txHash: log.transactionHash,
            actionLabel: "claim",
          })
        }

        if (decoded.eventName === "TermsProposed" && getAddress(args.worker) === address) {
          latestProposalNote = args.proposalNote || ""
          recentActivity.push({
            id: `${log.transactionHash}-${log.logIndex}`,
            title: "New terms proposed",
            detail: args.terminateOnReject
              ? "Rejecting can terminate this worker record."
              : "You can accept or reject to resume normal flow.",
            timestamp: log.blockNumber ?? null,
            tone: "warning",
            txHash: log.transactionHash,
            actionLabel: "terms proposed",
          })
        }

        if (decoded.eventName === "TermsAccepted" && getAddress(args.worker) === address) {
          recentActivity.push({
            id: `${log.transactionHash}-${log.logIndex}`,
            title: "Terms accepted",
            detail: "Your worker terms were updated onchain.",
            timestamp: log.blockNumber ?? null,
            tone: "default",
            txHash: log.transactionHash,
            actionLabel: "accept terms",
          })
        }

        if (decoded.eventName === "TermsRejected" && getAddress(args.worker) === address) {
          recentActivity.push({
            id: `${log.transactionHash}-${log.logIndex}`,
            title: "Terms rejected",
            detail: "Your previous terms resumed after rejection.",
            timestamp: log.blockNumber ?? null,
            tone: "default",
            txHash: log.transactionHash,
            actionLabel: "reject terms",
          })
        }

        if (decoded.eventName === "ProposalExpired" && getAddress(args.worker) === address) {
          recentActivity.push({
            id: `${log.transactionHash}-${log.logIndex}`,
            title: "Proposal expired",
            detail: args.terminated
              ? "The proposal expired and terminated this worker record."
              : "The proposal expired and old terms resumed.",
            timestamp: log.blockNumber ?? null,
            tone: args.terminated ? "warning" : "default",
            txHash: log.transactionHash,
            actionLabel: "proposal expired",
          })
        }

        if (decoded.eventName === "MigrationProposed") {
          const oldAddress = getAddress(args.oldAddress)
          const newAddress = getAddress(args.newAddress)

          if (oldAddress === address) {
            recentActivity.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              title: "Migration proposed",
              detail: `Waiting for ${newAddress} to accept the move.`,
              timestamp: log.blockNumber ?? null,
              tone: "warning",
              txHash: log.transactionHash,
              actionLabel: "propose migration",
            })
          }

          if (newAddress === address) {
            incomingCandidates.add(oldAddress)
            recentActivity.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              title: "Incoming migration request",
              detail: `${oldAddress} nominated this wallet as the destination.`,
              timestamp: log.blockNumber ?? null,
              tone: "warning",
              txHash: log.transactionHash,
              actionLabel: "incoming migration",
            })
          }
        }

        if (decoded.eventName === "MigrationCancelled") {
          const oldAddress = getAddress(args.oldAddress)
          const newAddress = getAddress(args.newAddress)

          if (oldAddress === address || newAddress === address) {
            recentActivity.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              title: "Migration cancelled",
              detail: "The pending wallet migration was cancelled.",
              timestamp: log.blockNumber ?? null,
              tone: "default",
              txHash: log.transactionHash,
              actionLabel: "cancel migration",
            })
          }
        }

        if (decoded.eventName === "MigrationCompleted") {
          const oldAddress = getAddress(args.oldAddress)
          const newAddress = getAddress(args.newAddress)

          if (oldAddress === address || newAddress === address) {
            recentActivity.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              title: "Migration completed",
              detail: `Worker state moved from ${oldAddress} to ${newAddress}.`,
              timestamp: log.blockNumber ?? null,
              tone: "default",
              txHash: log.transactionHash,
              actionLabel: "migration completed",
            })
          }
        }

        if (decoded.eventName === "LowTreasury" && getAddress(args.worker) === address) {
          recentActivity.push({
            id: `${log.transactionHash}-${log.logIndex}`,
            title: "Low treasury warning",
            detail: `Estimated runway dropped to ${formatDuration(args.estimatedRunwaySeconds)}.`,
            timestamp: log.blockNumber ?? null,
            tone: "warning",
            txHash: log.transactionHash,
            actionLabel: "low treasury",
          })
        }
      }

      const incomingCandidateList = Array.from(incomingCandidates)
      const incomingPendingChecks =
        incomingCandidateList.length > 0
          ? await publicClient.multicall({
              contracts: incomingCandidateList.map((oldAddress) => ({
                ...contract,
                functionName: "pendingMigrations",
                args: [oldAddress],
              })),
            })
          : []

      const incomingMigrationRequests = incomingCandidateList.filter((oldAddress, index) => {
        const result = incomingPendingChecks[index]
        if (result?.status !== "success") return false
        const pending = result.result as PendingMigrationResult
        return pending[0] && getAddress(pending[1]) === address
      })

      recentActivity.sort((left, right) => Number((right.timestamp ?? 0n) - (left.timestamp ?? 0n)))

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
              proposalNote: latestProposalNote,
            }
          : null,
        pendingMigration: pendingMigration[0]
          ? {
              exists: true,
              newAddress: getAddress(pendingMigration[1]),
            }
          : null,
        incomingMigrationRequests,
        recentActivity: recentActivity.slice(0, 8),
      }
    },
    staleTime: 15_000,
  })

  useEffect(() => {
    if (!address) return
    void queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, address] })
  }, [address, contract?.address, contract?.chainId, queryClient])

  return query
}

export { formatDuration, formatEth, formatRate, formatTimeline }
