import { config } from "./wagmi";

type Wallet = typeof import("./appkit")["appKit"];
let wallet: Wallet | undefined;
let loading: Promise<Wallet> | undefined;
let theme: "light" | "dark" = "dark";

export function setWalletTheme(value: "light" | "dark") {
  theme = value;
  wallet?.setThemeMode(value);
}

/** Share initialization across hover, click, and session restoration. */
export function loadWallet(): Promise<Wallet> {
  loading ??= import("./appkit")
    .then(async ({ appKit }) => {
      await appKit.ready();
      appKit.setThemeMode(theme);
      wallet = appKit;
      return appKit;
    })
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

export function prepareWallet() {
  void loadWallet().catch(() => {
    // A speculative download can be retried by the Connect button.
  });
}

export async function restoreWallet() {
  if (await config.storage?.getItem("recentConnectorId")) {
    // AppKit restores its authorized connectors during initialization. Keep
    // wagmi's reconnect too for sessions created before the wallet was deferred.
    await loadWallet();
    const { reconnect } = await import("wagmi/actions");
    await reconnect(config);
  }
}
