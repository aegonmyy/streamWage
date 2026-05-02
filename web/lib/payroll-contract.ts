import payrollArtifact from "@/lib/abi/StreamWagePayroll.json"
import { getAddress, isAddress, type Abi, type PublicClient, type Log } from "viem"

const DEFAULT_PAYROLL_CHAIN_ID = 31_337
const DEFAULT_FROM_BLOCK = 0n

export const payrollAbi = payrollArtifact.abi as Abi

function normalizeAddress(address: string | undefined): `0x${string}` | undefined {
  if (!address || !isAddress(address)) return undefined
  return getAddress(address)
}

export function getPayrollContractAddress(): `0x${string}` | undefined {
  return normalizeAddress(process.env.NEXT_PUBLIC_PAYROLL_CONTRACT_ADDRESS)
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

export function getPayrollContractConfig() {
  const address = getPayrollContractAddress()
  return address
    ? {
        address,
        abi: payrollAbi,
        chainId: getPayrollChainId(),
        fromBlock: getPayrollFromBlock(),
      }
    : undefined
}

/**
 * Fetches logs in chunks to avoid RPC "exceeded max allowed range" errors.
 */
export async function getLogsInChunks(
  publicClient: PublicClient,
  params: {
    address: `0x${string}`
    fromBlock: bigint
    toBlock: bigint | "latest"
  },
  chunkSize: bigint = 10_000n
): Promise<Log[]> {
  const currentBlock = await publicClient.getBlockNumber()
  const endBlock = params.toBlock === "latest" ? currentBlock : params.toBlock
  const startBlock = params.fromBlock

  if (startBlock > endBlock) return []

  let allLogs: Log[] = []
  for (let from = startBlock; from <= endBlock; from += chunkSize) {
    const to = from + chunkSize - 1n > endBlock ? endBlock : from + chunkSize - 1n
    
    const logs = await publicClient.getLogs({
      address: params.address,
      fromBlock: from,
      toBlock: to,
    })
    
    allLogs = [...allLogs, ...logs]
  }
  
  return allLogs
}
