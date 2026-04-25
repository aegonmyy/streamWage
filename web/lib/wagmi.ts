import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { localhost, mainnet, sepolia } from "wagmi/chains"

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "23a60240094ac6e7955f6f140f10bc95"

export const wagmiConfig = getDefaultConfig({
  appName: "StreamWage",
  projectId,
  chains: [localhost, sepolia, mainnet],
  ssr: true,
})
