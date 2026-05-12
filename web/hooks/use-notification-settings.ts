"use client"

import { useCallback, useEffect, useState } from "react"
import { useAccount } from "wagmi"
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase"

export interface NotificationSettings {
  slackWebhookUrl: string
  telegramBotToken: string
  telegramChatId: string
}

const EMPTY: NotificationSettings = {
  slackWebhookUrl: "",
  telegramBotToken: "",
  telegramChatId: "",
}

function cacheKey(address: string) {
  return `streamwage:notifications:${address.toLowerCase()}`
}

function toRow(address: string, s: NotificationSettings) {
  return {
    wallet_address: address.toLowerCase(),
    slack_webhook_url: s.slackWebhookUrl || null,
    telegram_bot_token: s.telegramBotToken || null,
    telegram_chat_id: s.telegramChatId || null,
  }
}

function fromRow(row: Record<string, string | null>): NotificationSettings {
  return {
    slackWebhookUrl: row.slack_webhook_url ?? "",
    telegramBotToken: row.telegram_bot_token ?? "",
    telegramChatId: row.telegram_chat_id ?? "",
  }
}

export function useNotificationSettings() {
  const { address } = useAccount()
  const [settings, setSettings] = useState<NotificationSettings>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!address) return

    // Seed from cache immediately so UI isn't blank
    try {
      const cached = localStorage.getItem(cacheKey(address))
      if (cached) setSettings(JSON.parse(cached))
    } catch {}

    if (!isSupabaseConfigured) {
      setSaved(false)
      return
    }

    // Then fetch from Supabase and reconcile
    setLoading(true)
    const supabase = requireSupabase()
    supabase
      .from("notification_settings")
      .select("*")
      .eq("wallet_address", address.toLowerCase())
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const s = fromRow(data)
          setSettings(s)
          try {
            localStorage.setItem(cacheKey(address), JSON.stringify(s))
          } catch {}
        }
      })
      .finally(() => setLoading(false))

    setSaved(false)
  }, [address])

  const save = useCallback(
    async (next: NotificationSettings) => {
      if (!address) return
      if (!isSupabaseConfigured) return

      const row = toRow(address, next)
      const supabase = requireSupabase()
      await supabase.from("notification_settings").upsert(row, {
        onConflict: "wallet_address",
      })
      setSettings(next)
      try {
        localStorage.setItem(cacheKey(address), JSON.stringify(next))
      } catch {}
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    [address],
  )

  const clear = useCallback(async () => {
    if (!address) return
    if (!isSupabaseConfigured) return

    const supabase = requireSupabase()
    await supabase
      .from("notification_settings")
      .delete()
      .eq("wallet_address", address.toLowerCase())
    try {
      localStorage.removeItem(cacheKey(address))
    } catch {}
    setSettings(EMPTY)
  }, [address])

  return { settings, save, clear, saved, loading }
}
