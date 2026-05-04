"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePublicClient } from "wagmi"
import { decodeEventLog, formatEther, formatUnits, getAddress, type Address } from "viem"
import { getPayrollContractConfig, payrollAbi, getLogsInChunks } from "@/lib/payroll-contract"

export type PayrollTimeline = "Hourly" | "Monthly" | "Custom" | "Trigger"

export type AdminWorkerRecord = {
  address: Address
  name: string
  role: string
  metadata: string
  timeline: PayrollTimeline
  amountPerIntervalWei: bigint
  intervalSeconds: bigint
  accruedWei: bigint
  totalClaimedWei: bigint
  claimableWei: bigint
  runwaySeconds: bigint
  pendingProposal: {
    timeline: PayrollTimeline
    amountPerIntervalWei: bigint
    intervalSeconds: bigint
    terminateOnReject: boolean
    expiryTimestamp: bigint
  } | null
  pendingMigration: {
    newAddress: Address
  } | null
  status: "active" | "paused"
}

export type PayrollAdminData = {
  owner: Address
  admins: Address[]
  workers: AdminWorkerRecord[]
  treasuryBalanceWei: bigint
  totalRatePerSecondWei: bigint
  runwaySeconds: bigint
  defaultProposalWindowSeconds: bigint
  lowTreasuryThresholdSeconds: bigint
  lifetimePaidWei: bigint
}

const QUERY_KEY = ["payroll-admin"]

function timelineLabel(value: number): PayrollTimeline {
  if (value === 0) return "Hourly"
  if (value === 1) return "Monthly"
  if (value === 2) return "Custom"
  return "Trigger"
}

function parseMetadata(metadata: string) {
  const chunks = metadata
    .split(/[|,-]/)
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    name: chunks[0] ?? "Unnamed Worker",
    role: chunks[1] ?? (metadata || "Worker"),
  }
}

export function formatDuration(seconds: bigint) {
  if (seconds === 0n) return "0s"
  if (seconds === 2n ** 256n - 1n) return "∞"

  const day = 86_400n
  const hour = 3_600n
  const minute = 60n

  if (seconds >= day) return `${seconds / day}d`
  if (seconds >= hour) return `${seconds / hour}h`
  if (seconds >= minute) return `${seconds / minute}m`
  return `${seconds}s`
}

export function formatTimeline(worker: Pick<AdminWorkerRecord, "timeline" | "intervalSeconds">) {
  if (worker.timeline !== "Custom") return worker.timeline
  return `Custom (${formatDuration(worker.intervalSeconds)})`
}

export function formatRate(worker: Pick<AdminWorkerRecord, "timeline" | "amountPerIntervalWei" | "intervalSeconds">) {
  if (worker.timeline === "Trigger") return "—"
  const amount = formatEther(worker.amountPerIntervalWei)
  return `${amount} ETH / ${worker.timeline === "Custom" ? formatDuration(worker.intervalSeconds) : worker.timeline.toLowerCase()}`
}

export function formatEth(value: bigint, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(Number(formatEther(value)))
}

export function formatWeiRatePerDay(value: bigint) {
  const perDay = value * 86_400n
  return `${formatEth(perDay)} ETH/day`
}

export function usePayrollAdminData() {
  const contract = getPayrollContractConfig()
  const publicClient = usePublicClient({ chainId: contract?.chainId })
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    enabled: !!contract && !!publicClient,
    queryFn: async (): Promise<PayrollAdminData> => {
      if (!contract || !publicClient) {
        throw new Error("Payroll contract is not configured.")
      }

      const logs = await getLogsInChunks(publicClient, {
        address: contract.address,
        fromBlock: contract.fromBlock,
        toBlock: "latest",
      })

      const workers = new Set<Address>()
      const admins = new Map<Address, boolean>()
      let ownerFromLogs: Address | undefined

      for (const log of logs) {
        const decoded = decodeEventLog({
          abi: payrollAbi,
          data: log.data,
          topics: log.topics,
        })
        const args = decoded.args as any

        if (decoded.eventName === "WorkerAdded") {
          workers.add(getAddress(args.worker))
        }

        if (decoded.eventName === "MigrationCompleted") {
          workers.delete(getAddress(args.oldAddress))
          workers.add(getAddress(args.newAddress))
        }

        if (decoded.eventName === "AdminUpdated") {
          admins.set(getAddress(args.admin), args.enabled)
        }

        if (decoded.eventName === "OwnerTransferred") {
          ownerFromLogs = getAddress(args.newOwner)
        }
      }

      const baseReads = await Promise.all([
        publicClient.readContract({
          ...contract,
          functionName: "owner",
        }),
        publicClient.readContract({
          ...contract,
          functionName: "defaultProposalWindow",
        }),
        publicClient.readContract({
          ...contract,
          functionName: "lowTreasuryThresholdSeconds",
        }),
        publicClient.readContract({
          ...contract,
          functionName: "treasuryRunway",
        }),
        publicClient.getBalance({
          address: contract.address,
        }),
      ])

      const owner = getAddress((baseReads[0] as Address) ?? ownerFromLogs ?? contract.address)
      const defaultProposalWindowSeconds = baseReads[1] as bigint
      const lowTreasuryThresholdSeconds = baseReads[2] as bigint
      const [totalRatePerSecondWei, runwaySeconds] = baseReads[3] as [bigint, bigint]
      const treasuryBalanceWei = baseReads[4] as bigint

      admins.delete(owner)
      const enabledAdmins = Array.from(admins.entries())
        .filter(([, enabled]) => enabled)
        .map(([address]) => address)
        .sort()

      const workerAddresses = Array.from(workers.values()).sort()

      const workerReads =
        workerAddresses.length > 0
          ? await publicClient.multicall({
              contracts: workerAddresses.flatMap((workerAddress) => [
                {
                  ...contract,
                  functionName: "workers",
                  args: [workerAddress],
                },
                {
                  ...contract,
                  functionName: "claimable",
                  args: [workerAddress],
                },
                {
                  ...contract,
                  functionName: "workerRunway",
                  args: [workerAddress],
                },
                {
                  ...contract,
                  functionName: "pendingTerms",
                  args: [workerAddress],
                },
                {
                  ...contract,
                  functionName: "pendingMigrations",
                  args: [workerAddress],
                },
              ]),
            })
          : []

      const workerRecords: AdminWorkerRecord[] = []
      let lifetimePaidWei = 0n

      for (let index = 0; index < workerAddresses.length; index += 1) {
        const workerAddress = workerAddresses[index]
        const workerResult = workerReads[index * 5]
        const claimableResult = workerReads[index * 5 + 1]
        const runwayResult = workerReads[index * 5 + 2]
        const pendingTermsResult = workerReads[index * 5 + 3]
        const pendingMigrationResult = workerReads[index * 5 + 4]

        if (
          workerResult?.status !== "success" || 
          claimableResult?.status !== "success" || 
          runwayResult?.status !== "success" || 
          pendingTermsResult?.status !== "success" ||
          pendingMigrationResult?.status !== "success"
        ) {
          continue
        }

        const worker = workerResult.result as readonly [boolean, boolean, number, bigint, bigint, bigint, bigint, bigint, string]
        if (!worker[0]) continue

        const metadata = worker[8]
        const parsedMetadata = parseMetadata(metadata)
        const pendingTerms = pendingTermsResult.result as readonly [boolean, number, bigint, bigint, boolean, bigint]
        const pendingMigration = pendingMigrationResult.result as readonly [boolean, Address]

        lifetimePaidWei += worker[6]

        workerRecords.push({
          address: workerAddress,
          name: parsedMetadata.name,
          role: parsedMetadata.role,
          metadata,
          timeline: timelineLabel(Number(worker[2])),
          amountPerIntervalWei: worker[3],
          intervalSeconds: worker[4],
          accruedWei: worker[5],
          totalClaimedWei: worker[6],
          claimableWei: claimableResult.result as bigint,
          runwaySeconds: runwayResult.result as bigint,
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
                newAddress: getAddress(pendingMigration[1]),
              }
            : null,
          status: worker[1] ? "active" : "paused",
        })
      }

      return {
        owner,
        admins: enabledAdmins,
        workers: workerRecords,
        treasuryBalanceWei,
        totalRatePerSecondWei,
        runwaySeconds,
        defaultProposalWindowSeconds,
        lowTreasuryThresholdSeconds,
        lifetimePaidWei,
      }
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  useEffect(() => {
    if (!contract) return
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }, [contract, queryClient])

  return query
}
