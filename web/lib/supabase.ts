import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type WorkerEnrollment = {
  id: string
  worker_address: string
  contract_address: string
  chain_id: number
  created_at: string
}

export type NotificationSettings = {
  wallet_address: string
  slack_webhook_url: string | null
  telegram_bot_token: string | null
  telegram_chat_id: string | null
  updated_at: string
}
