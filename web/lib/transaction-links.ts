import { wagmiConfig } from "@/lib/wagmi"

export function getTransactionExplorerUrl(chainId: number | undefined, hash: `0x${string}`) {
  if (!chainId) return null
  const chain = wagmiConfig.chains.find((item) => item.id === chainId)
  const baseUrl = chain?.blockExplorers?.default?.url
  if (!baseUrl) return null
  return `${baseUrl.replace(/\/$/, "")}/tx/${hash}`
}

export function getTransactionToastDescription(
  chainId: number | undefined,
  hash: `0x${string}`,
) {
  const explorerUrl = getTransactionExplorerUrl(chainId, hash)
  return explorerUrl ? `View transaction: ${explorerUrl}` : hash
}
