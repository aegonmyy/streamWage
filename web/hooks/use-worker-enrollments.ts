"use client"

import { useQuery } from "@tanstack/react-query"
import { getAddress, isAddress, type Address } from "viem"
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase"

export type WorkerEnrollment = {
  contractAddress: Address
  chainId: number
}

export function useWorkerEnrollments(workerAddress: Address | undefined) {
  return useQuery({
    queryKey: ["worker-enrollments", workerAddress],
    enabled: Boolean(workerAddress && isSupabaseConfigured),
    staleTime: 30_000,
    queryFn: async (): Promise<WorkerEnrollment[]> => {
      if (!workerAddress) return []

      const supabase = requireSupabase()
      const { data, error } = await supabase
        .from("worker_enrollments")
        .select("contract_address, chain_id")
        .eq("worker_address", workerAddress.toLowerCase())

      if (error) throw error
      if (!data) return []

      return data
        .filter((row) => isAddress(row.contract_address))
        .map((row) => ({
          contractAddress: getAddress(row.contract_address),
          chainId: row.chain_id,
        }))
    },
  })
}

export async function registerWorkerEnrollment({
  workerAddress,
  contractAddress,
  chainId,
}: {
  workerAddress: Address
  contractAddress: Address
  chainId: number
}) {
  if (!isSupabaseConfigured) return

  const supabase = requireSupabase()
  const { error } = await supabase.from("worker_enrollments").upsert(
    {
      worker_address: workerAddress.toLowerCase(),
      contract_address: contractAddress.toLowerCase(),
      chain_id: chainId,
    },
    { onConflict: "worker_address,contract_address,chain_id" }
  )

  if (error) {
    console.error("Failed to register worker enrollment:", error)
  }
}
