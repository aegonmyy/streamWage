import { getPayrollContractConfig } from "@/lib/payroll-contract"

export type DashboardRole = "admin" | "worker"

export function getDashboardPathForRole(role: DashboardRole): string {
  return role === "admin" ? "/dashboard/admin" : "/dashboard/worker"
}

export function defaultDashboardPathForAddress(address: string | undefined, isConnected: boolean): string {
  if (!isConnected || !address) return getDashboardPathForRole("worker")
  return getDashboardPathForRole("worker")
}
