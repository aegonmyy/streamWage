"use client"

export function getDisplayErrorMessage(error: unknown, fallback = "Something went wrong.") {
  const message = error instanceof Error ? error.message : fallback
  const normalized = message.toLowerCase()

  if (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("request rejected") ||
    normalized.includes("rejected the request") ||
    normalized.includes("rejected")
  ) {
    return "Request cancelled."
  }

  if (normalized.includes("insufficient funds")) {
    return "Insufficient funds for this action."
  }

  if (normalized.includes("encoded event signature") && normalized.includes("not found on abi")) {
    return "Activity logs included an event this screen does not use. Please retry."
  }

  if (message.length > 220) {
    return fallback
  }

  return message || fallback
}
