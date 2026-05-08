"use client"

import { getAddress, isAddress, type Address } from "viem"

const LAST_OPENED_PAYROLLS_KEY = "streamwage:last-opened-payrolls"
const LAST_WORKER_PAYROLLS_KEY = "streamwage:last-worker-payrolls"

function normalizeAddress(address: string) {
  return isAddress(address) ? getAddress(address) : null
}

function readAddressMap(storageKey: string): Record<string, Address> {
  if (typeof window === "undefined") return {}

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key, normalizeAddress(value)])
        .filter((entry): entry is [string, Address] => !!entry[1])
    )
  } catch {
    return {}
  }
}

function writeAddressMap(storageKey: string, value: Record<string, Address>) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(storageKey, JSON.stringify(value))
}

export function getAdminDashboardPath(contractAddress: Address, section?: string) {
  return section
    ? `/dashboard/${contractAddress}/admin?section=${section}`
    : `/dashboard/${contractAddress}/admin`
}

export function getWorkerDashboardPath(contractAddress: Address, section?: string) {
  return section
    ? `/dashboard/${contractAddress}/worker?section=${section}`
    : `/dashboard/${contractAddress}/worker`
}

export function rememberLastOpenedPayroll(ownerAddress: Address, payrollAddress: Address) {
  const existing = readAddressMap(LAST_OPENED_PAYROLLS_KEY)
  existing[ownerAddress] = payrollAddress
  writeAddressMap(LAST_OPENED_PAYROLLS_KEY, existing)
}

export function getLastOpenedPayroll(ownerAddress: Address) {
  return readAddressMap(LAST_OPENED_PAYROLLS_KEY)[ownerAddress]
}

export function rememberLastWorkerPayroll(workerAddress: Address, payrollAddress: Address) {
  const existing = readAddressMap(LAST_WORKER_PAYROLLS_KEY)
  existing[workerAddress] = payrollAddress
  writeAddressMap(LAST_WORKER_PAYROLLS_KEY, existing)
}

export function getLastWorkerPayroll(workerAddress: Address) {
  return readAddressMap(LAST_WORKER_PAYROLLS_KEY)[workerAddress]
}
