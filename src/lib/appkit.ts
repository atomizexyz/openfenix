import { createAppKit } from "@reown/appkit";
import { mainnet } from "wagmi/chains";
import { networks, projectId } from "./wagmi";
import { wagmiAdapter } from "./wallet-adapter";

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: mainnet,
  metadata: {
    name: "Fenix Protocol",
    description: "Burn XEN, Stake FENIX, Earn Trustless Yield",
    url: "https://fenix.fyi",
    icons: ["https://fenix.fyi/images/fenix-logo.svg"],
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#f97316",
    // The site's own face. It also keeps AppKit from fetching its default
    // font from fonts.reown.com, which the CSP's font-src does not allow.
    "--w3m-font-family": "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  },
  features: {
    // Wallet connection only: no embedded email/social wallets, and none of
    // AppKit's swap/on-ramp/send flows, which are not part of this app.
    email: false,
    socials: false,
    swaps: false,
    onramp: false,
    send: false,
    receive: false,
    // No usage telemetry to Reown.
    analytics: false,
  },
  // The Coinbase and Base Account connectors need their SDKs installed as
  // wagmi optional peers; leaving them out keeps that dependency tree (and its
  // advisories) out of the bundle. Coinbase Wallet still connects through its
  // extension (EIP-6963) or WalletConnect.
  enableCoinbase: false,
  enableBaseAccount: false,
});

