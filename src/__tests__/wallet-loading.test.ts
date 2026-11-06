import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  initialize: vi.fn(),
  ready: vi.fn(),
  setThemeMode: vi.fn(),
  reconnect: vi.fn(),
}));

vi.mock("@/lib/wagmi", () => ({
  config: { storage: { getItem: mocks.getItem } },
}));
vi.mock("@/lib/appkit", () => {
  mocks.initialize();
  return { appKit: { ready: mocks.ready, setThemeMode: mocks.setThemeMode } };
});
vi.mock("wagmi/actions", () => ({ reconnect: mocks.reconnect }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.getItem.mockResolvedValue(null);
  mocks.ready.mockResolvedValue(undefined);
});
afterEach(() => vi.resetModules());

describe("deferred wallet loading", () => {
  it("does not initialize a wallet for a new visitor or a theme change", async () => {
    const { restoreWallet, setWalletTheme } = await import("@/lib/wallet");
    setWalletTheme("light");
    await restoreWallet();
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.reconnect).not.toHaveBeenCalled();
  });

  it("shares initialization and applies the latest theme before opening", async () => {
    let finish!: () => void;
    mocks.ready.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { loadWallet, setWalletTheme } = await import("@/lib/wallet");
    const first = loadWallet();
    const second = loadWallet();
    expect(second).toBe(first);
    setWalletTheme("light");
    finish();
    await first;
    expect(mocks.ready).toHaveBeenCalledTimes(1);
    expect(mocks.setThemeMode).toHaveBeenLastCalledWith("light");
    setWalletTheme("dark");
    expect(mocks.setThemeMode).toHaveBeenLastCalledWith("dark");
  });

  it("restores a returning wallet through the shared config", async () => {
    mocks.getItem.mockResolvedValue("injected");
    const { restoreWallet } = await import("@/lib/wallet");
    const { config } = await import("@/lib/wagmi");
    await restoreWallet();
    expect(mocks.ready).toHaveBeenCalledTimes(1);
    expect(mocks.reconnect).toHaveBeenCalledWith(config);
  });

  it("lets Connect retry after initialization fails", async () => {
    mocks.ready.mockRejectedValueOnce(new Error("Failed to load wallet"));
    const { loadWallet } = await import("@/lib/wallet");
    await expect(loadWallet()).rejects.toThrow("Failed to load wallet");
    await expect(loadWallet()).resolves.toBeDefined();
    expect(mocks.ready).toHaveBeenCalledTimes(2);
  });
});
