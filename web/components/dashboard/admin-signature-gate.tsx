"use client"

import { useEffect, useMemo, useState } from "react"
import { useSignMessage } from "wagmi"
import { getAddress, verifyMessage } from "viem"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePayrollRole } from "@/hooks/use-payroll-role"
import { toast } from "sonner"
import { getDisplayErrorMessage } from "@/lib/error-message"

const SIGNATURE_VERSION = "v1"
const SESSION_TTL_MS = 30 * 60 * 1000

function buildAdminMessage({
  address,
  chainId,
  contractAddress,
}: {
  address: string
  chainId?: number
  contractAddress?: string
}) {
  return [
    "StreamWage admin access verification",
    "",
    "Sign this message to confirm you control the connected admin wallet.",
    "This does not submit a transaction.",
    "",
    `Wallet: ${address}`,
    `Chain ID: ${chainId ?? "unknown"}`,
    `Payroll Contract: ${contractAddress ?? "unconfigured"}`,
    `Version: ${SIGNATURE_VERSION}`,
  ].join("\n")
}

function getSessionKey(address: string, chainId?: number, contractAddress?: string) {
  return `streamwage:admin-signature:${address}:${chainId ?? "na"}:${contractAddress ?? "na"}:${SIGNATURE_VERSION}`
}

type VerifiedSession = {
  signature: `0x${string}`
  verifiedAt: number
}

export function AdminSignatureGate({ children }: { children: React.ReactNode }) {
  const { address, chainId, contractAddress, isAdmin, isDevMode } = usePayrollRole()
  const [verifiedKey, setVerifiedKey] = useState<string | undefined>(undefined)
  const { signMessageAsync, isPending, error, reset } = useSignMessage()

  const message = useMemo(() => {
    if (!address) return undefined
    return buildAdminMessage({ address, chainId, contractAddress })
  }, [address, chainId, contractAddress])

  const sessionKey = useMemo(() => {
    if (!address || !isAdmin) return undefined
    return getSessionKey(address, chainId, contractAddress)
  }, [address, chainId, contractAddress, isAdmin])

  const [sessionVerified, setSessionVerified] = useState(false)

  useEffect(() => {
    if (!error) return
    toast.error("Admin verification", {
      description: getDisplayErrorMessage(error, "Signature request failed."),
    })
    reset()
  }, [error, reset])

  useEffect(() => {
    if (isDevMode) {
      setSessionVerified(true)
      return
    }
    let cancelled = false

    async function validateSession() {
      if (!sessionKey || !message || !address || !isAdmin) {
        setSessionVerified(false)
        return
      }

      try {
        const raw = sessionStorage.getItem(sessionKey)
        if (!raw) {
          setSessionVerified(false)
          return
        }

        const parsed = JSON.parse(raw) as VerifiedSession
        if (!parsed?.signature || !parsed?.verifiedAt) {
          sessionStorage.removeItem(sessionKey)
          setSessionVerified(false)
          return
        }

        if (Date.now() - parsed.verifiedAt > SESSION_TTL_MS) {
          sessionStorage.removeItem(sessionKey)
          setSessionVerified(false)
          return
        }

        const valid = await verifyMessage({
          address: getAddress(address),
          message,
          signature: parsed.signature,
        })

        if (!cancelled) {
          setSessionVerified(valid)
        }
      } catch {
        try {
          sessionStorage.removeItem(sessionKey)
        } catch {}
        if (!cancelled) {
          setSessionVerified(false)
        }
      }
    }

    void validateSession()

    return () => {
      cancelled = true
    }
  }, [address, isAdmin, message, sessionKey])

  const isVerified = (sessionKey && verifiedKey === sessionKey) || sessionVerified

  const handleVerify = async () => {
    if (!address || !message || !sessionKey) return

    let signature: `0x${string}`
    try {
      signature = await signMessageAsync({ message })
    } catch {
      return
    }

    const verified = await verifyMessage({
      address: getAddress(address),
      message,
      signature,
    })

    if (!verified) {
      throw new Error("Signature verification failed for the connected wallet.")
    }

    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({
        signature,
        verifiedAt: Date.now(),
      } satisfies VerifiedSession),
    )
    setVerifiedKey(sessionKey)
    setSessionVerified(true)
    reset()
  }

  if (!isAdmin || isVerified) return <>{children}</>

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Verify Admin Wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-6 text-muted-foreground break-all whitespace-pre-wrap">
            {message}
          </div>
          <Button type="button" onClick={handleVerify} disabled={isPending || !message}>
            {isPending ? "Waiting for signature…" : "Sign Message"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
