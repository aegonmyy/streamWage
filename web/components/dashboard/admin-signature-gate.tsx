"use client"

import { useEffect, useMemo, useState } from "react"
import { useSignMessage } from "wagmi"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePayrollRole } from "@/hooks/use-payroll-role"

const SIGNATURE_VERSION = "v1"

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

export function AdminSignatureGate({ children }: { children: React.ReactNode }) {
  const { address, chainId, contractAddress, isAdmin } = usePayrollRole()
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

  const sessionVerified = useMemo(() => {
    if (!sessionKey) return false
    try {
      return sessionStorage.getItem(sessionKey) === "verified"
    } catch {
      return false
    }
  }, [sessionKey])

  const isVerified = (sessionKey && verifiedKey === sessionKey) || sessionVerified

  const handleVerify = async () => {
    if (!address || !message || !sessionKey) return

    const signature = await signMessageAsync({ message })
    if (!signature) return

    sessionStorage.setItem(sessionKey, "verified")
    setVerifiedKey(sessionKey)
    reset()
  }

  if (!isAdmin || isVerified) return <>{children}</>

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Verify Admin Wallet</CardTitle>
          <CardDescription>
            Sign a message once per browser session before opening admin controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-6 text-muted-foreground">
            {message}
          </div>
          {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
          <Button type="button" onClick={handleVerify} disabled={isPending || !message}>
            {isPending ? "Waiting for signature…" : "Sign Message"}
          </Button>
          <p className="text-xs text-muted-foreground">
            This is a client-side anti-impersonation check. For real auth, verify the signature on the server and issue a session.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
