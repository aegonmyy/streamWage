"use client"

import { useState, useEffect } from "react"
import { Bell, BellOff, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useNotificationSettings, type NotificationSettings } from "@/hooks/use-notification-settings"

export function NotificationSettingsView() {
  const { settings, save, clear, saved, loading } = useNotificationSettings()
  const [draft, setDraft] = useState<NotificationSettings>(settings)

  useEffect(() => {
    setDraft(settings)
  }, [settings])

  const hasAnyConfig =
    draft.slackWebhookUrl || draft.telegramBotToken || draft.telegramChatId

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Slack</CardTitle>
          <CardDescription>Paste your incoming webhook URL to receive notifications in a Slack channel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={draft.slackWebhookUrl}
            onChange={(e) => setDraft((d) => ({ ...d, slackWebhookUrl: e.target.value }))}
            placeholder="https://hooks.slack.com/services/..."
            className="font-mono"
            disabled={loading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
          <CardDescription>Enter your bot token and the chat ID where notifications should be sent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={draft.telegramBotToken}
            onChange={(e) => setDraft((d) => ({ ...d, telegramBotToken: e.target.value }))}
            placeholder="Bot token — from @BotFather"
            className="font-mono"
            disabled={loading}
          />
          <Input
            value={draft.telegramChatId}
            onChange={(e) => setDraft((d) => ({ ...d, telegramChatId: e.target.value }))}
            placeholder="Chat ID — from /getUpdates"
            className="font-mono"
            disabled={loading}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => save(draft)} disabled={loading} className="rounded-xl gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {saved ? "Saved" : "Save"}
        </Button>
        {hasAnyConfig && !loading && (
          <Button variant="outline" onClick={clear} className="rounded-xl gap-2">
            <BellOff className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>


    </div>
  )
}
