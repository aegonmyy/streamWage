import type { Address } from "viem"
import { getAdminDashboardPath, getWorkerDashboardPath } from "@/lib/payroll-routing"

export type DashboardRole = "admin" | "worker"

export function getDashboardPathForRole(role: DashboardRole, contractAddress: Address): string {
  return role === "admin" ? getAdminDashboardPath(contractAddress) : getWorkerDashboardPath(contractAddress)
}

export function defaultDashboardPathForAddress(address: string | undefined, isConnected: boolean): string {
  if (!isConnected || !address) return "/dashboard"
  return "/dashboard"
}
