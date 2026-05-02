import { getDefaultConfig, getDefaultWallets } from "@rainbow-me/rainbowkit"
import { http } from "wagmi"
import { hoodi, localhost } from "wagmi/chains"

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "23a60240094ac6e7955f6f140f10bc95"

const { wallets } = getDefaultWallets({
  appName: "StreamWage",
  projectId,
})

export const wagmiConfig = getDefaultConfig({
  appName: "StreamWage",
  projectId,
  chains: [hoodi, localhost],
  wallets,
  transports: {
    [hoodi.id]: http(process.env.NEXT_PUBLIC_HOODI_RPC_URL ?? hoodi.rpcUrls.default.http[0]),
    [localhost.id]: http(),
  },
  ssr: true,
})
