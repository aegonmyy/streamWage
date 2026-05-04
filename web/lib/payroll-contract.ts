import payrollArtifact from "@/lib/abi/StreamWagePayroll.json"
import { getAddress, isAddress, type Abi, type PublicClient, type Log } from "viem"

const DEFAULT_PAYROLL_CHAIN_ID = 31_337
const DEFAULT_FROM_BLOCK = 0n
const DEFAULT_EVENT_LOOKBACK_BLOCKS = 500n

export const payrollAbi = payrollArtifact as unknown as Abi

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
  params: any,
  chunkSize: bigint = 500n
): Promise<Log[]> {
  const currentBlock = await publicClient.getBlockNumber()
  
  const fromBlock = typeof params.fromBlock === 'bigint' 
    ? params.fromBlock 
    : (params.fromBlock === 'earliest' ? 0n : currentBlock)
    
  const toBlock = typeof params.toBlock === 'bigint'
    ? params.toBlock
    : (params.toBlock === 'earliest' ? 0n : currentBlock)

  if (fromBlock > toBlock) return []

  const fetchRange = async (fromBlock: bigint, toBlock: bigint): Promise<Log[]> => {
    try {
      return await publicClient.getLogs({
        ...params,
        fromBlock,
        toBlock,
      } as any)
    } catch (error) {
      if (fromBlock >= toBlock || toBlock - fromBlock < 10n) {
        throw error
      }

      const midpoint = fromBlock + (toBlock - fromBlock) / 2n
      const [left, right] = await Promise.all([
        fetchRange(fromBlock, midpoint),
        fetchRange(midpoint + 1n, toBlock),
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
