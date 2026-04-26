import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { http } from "wagmi"
import { hoodi, localhost } from "wagmi/chains"

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "23a60240094ac6e7955f6f140f10bc95"

export const wagmiConfig = getDefaultConfig({
  appName: "StreamWage",
  projectId,
  // Hoodi-first config (keeps localhost for local dev).
  chains: [hoodi, localhost],
  transports: {
    [hoodi.id]: http(process.env.NEXT_PUBLIC_HOODI_RPC_URL ?? hoodi.rpcUrls.default.http[0]),
    [localhost.id]: http(),
  },
  ssr: true,
})
