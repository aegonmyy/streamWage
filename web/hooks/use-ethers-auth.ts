"use client"

import { useState, useEffect, useCallback } from "react"
import { ethers } from "ethers"

export function useEthersAuth() {
  const [address, setAddress] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)

  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true"
  const devAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" // Default Anvil #0

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      console.warn("No ethereum provider found")
      return
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await browserProvider.send("eth_requestAccounts", [])
      if (accounts.length > 0) {
        setAddress(accounts[0])
        setIsConnected(true)
        setProvider(browserProvider)
      }
    } catch (err) {
      console.error("Failed to connect to ethers:", err)
    }
  }, [])

  useEffect(() => {
    if (isDevMode) {
      setAddress(devAddress)
      setIsConnected(true)
      return
    }

    if (typeof window !== "undefined" && window.ethereum) {
      const browserProvider = new ethers.BrowserProvider(window.ethereum)
      setProvider(browserProvider)
      
      browserProvider.listAccounts().then(accounts => {
        if (accounts.length > 0) {
          setAddress(accounts[0].address)
          setIsConnected(true)
        }
      })
    }
  }, [isDevMode])

  return {
    address: address as `0x${string}` | undefined,
    isConnected,
    connect,
    provider,
    isDevMode
  }
}
