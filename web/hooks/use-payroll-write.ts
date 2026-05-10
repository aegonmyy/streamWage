"use client"

import { useWriteContract } from "wagmi"

export function usePayrollWrite() {
  return useWriteContract()
}
