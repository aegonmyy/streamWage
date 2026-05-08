"use client"

import { createContext, useContext, useMemo } from "react"
import { useParams } from "next/navigation"
import payrollArtifact from "@/lib/abi/StreamWagePayroll.json"
import { getAddress, isAddress, parseAbiItem, type Abi, type Address, type Log, type PublicClient } from "viem"

const DEFAULT_PAYROLL_CHAIN_ID = 560048
const DEFAULT_FROM_BLOCK = 0n
const DEFAULT_EVENT_LOOKBACK_BLOCKS = 500n

export const payrollAbi = ((payrollArtifact as { abi?: Abi }).abi ?? payrollArtifact) as unknown as Abi

const factoryAbi = [
  {
    type: "function",
    name: "deployPayroll",
    stateMutability: "nonpayable",
    inputs: [{ name: "initialOwner", type: "address" }],
    outputs: [{ name: "payroll", type: "address" }],
  },
  {
    type: "event",
    name: "PayrollDeployed",
    anonymous: false,
    inputs: [
      { name: "payroll", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "deployedBy", type: "address", indexed: true },
    ],
  },
] as const satisfies Abi

type PayrollContractConfig = {
  address: Address
  abi: Abi
  chainId: number
  fromBlock: bigint
}

const PayrollContractContext = createContext<PayrollContractConfig | undefined>(undefined)

function normalizeAddress(address: string | undefined): Address | undefined {
  if (!address || !isAddress(address)) return undefined
  return getAddress(address)
}

export function getPayrollChainId(): number {
  const raw = process.env.NEXT_PUBLIC_PAYROLL_CHAIN_ID
  const value = raw ? Number(raw) : DEFAULT_PAYROLL_CHAIN_ID
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_PAYROLL_CHAIN_ID
}

export function getPayrollFromBlock(): bigint {
  const raw = process.env.NEXT_PUBLIC_PAYROLL_FROM_BLOCK
  if (!raw) return DEFAULT_FROM_BLOCK

  try {
    const value = BigInt(raw)
    return value >= 0n ? value : DEFAULT_FROM_BLOCK
  } catch {
    return DEFAULT_FROM_BLOCK
  }
}

export function getPayrollEventLookbackBlocks(): bigint {
  const raw = process.env.NEXT_PUBLIC_PAYROLL_EVENT_LOOKBACK_BLOCKS
  if (!raw) return DEFAULT_EVENT_LOOKBACK_BLOCKS

  try {
    const value = BigInt(raw)
    return value > 0n ? value : DEFAULT_EVENT_LOOKBACK_BLOCKS
  } catch {
    return DEFAULT_EVENT_LOOKBACK_BLOCKS
  }
}

export function getFactoryContractAddress(): Address | undefined {
  return normalizeAddress(process.env.NEXT_PUBLIC_PAYROLL_FACTORY_ADDRESS)
}

export function getFactoryContractConfig() {
  const address = getFactoryContractAddress()
  return address
    ? {
        address,
        abi: factoryAbi,
        chainId: getPayrollChainId(),
        fromBlock: getPayrollFromBlock(),
      }
    : undefined
}

export function buildPayrollContractConfig(address: Address | undefined): PayrollContractConfig | undefined {
  return address
    ? {
        address,
        abi: payrollAbi,
        chainId: getPayrollChainId(),
        fromBlock: getPayrollFromBlock(),
      }
    : undefined
}

export function PayrollContractProvider({ children }: { children: React.ReactNode }) {
  const params = useParams<{ contractAddress?: string }>()
  const contractAddress = normalizeAddress(params?.contractAddress)

  const value = useMemo(() => buildPayrollContractConfig(contractAddress), [contractAddress])

  return <PayrollContractContext.Provider value={value}>{children}</PayrollContractContext.Provider>
}

export function usePayrollContractConfig() {
  return useContext(PayrollContractContext)
}

export function usePayrollContractAddress() {
  return usePayrollContractConfig()?.address
}

export const payrollDeployedEvent = parseAbiItem(
  "event PayrollDeployed(address indexed payroll, address indexed owner, address indexed deployedBy)"
)

/**
 * Fetches logs in chunks to avoid RPC "exceeded max allowed range" errors.
 */
export async function getLogsInChunks(
  publicClient: PublicClient,
  params: any,
  chunkSize: bigint = 500n
): Promise<Log[]> {
  const currentBlock = await publicClient.getBlockNumber()

  const fromBlock =
    typeof params.fromBlock === "bigint" ? params.fromBlock : params.fromBlock === "earliest" ? 0n : currentBlock

  const toBlock =
    typeof params.toBlock === "bigint" ? params.toBlock : params.toBlock === "earliest" ? 0n : currentBlock

  if (fromBlock > toBlock) return []

  const fetchRange = async (rangeFromBlock: bigint, rangeToBlock: bigint): Promise<Log[]> => {
    try {
      return await publicClient.getLogs({
        ...params,
        fromBlock: rangeFromBlock,
        toBlock: rangeToBlock,
      } as any)
    } catch (error) {
      if (rangeFromBlock >= rangeToBlock || rangeToBlock - rangeFromBlock < 10n) {
        throw error
      }

      const midpoint = rangeFromBlock + (rangeToBlock - rangeFromBlock) / 2n
      const [left, right] = await Promise.all([
        fetchRange(rangeFromBlock, midpoint),
        fetchRange(midpoint + 1n, rangeToBlock),
      ])
      return [...left, ...right]
    }
  }

  let allLogs: Log[] = []
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const to = from + chunkSize - 1n > toBlock ? toBlock : from + chunkSize - 1n
    const logs = await fetchRange(from, to)
    allLogs = [...allLogs, ...logs]
  }

  return allLogs
}
