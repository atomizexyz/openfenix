import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

const { account } = vi.hoisted(() => ({
  account: {
    chain: undefined as { id: number } | undefined,
  },
}));

vi.mock("wagmi", () => ({
  useConnection: () => account,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/components/dashboard/dashboard-chain-selector", () => ({
  DashboardChainSelector: ({
    chainId,
    onChainChange,
  }: {
    chainId: number;
    onChainChange: (chainId: number) => void;
  }) => (
    <button
      type="button"
      data-testid="chain-selector"
      onClick={() => onChainChange(137)}
    >
      {chainId}
    </button>
  ),
}));

vi.mock("@/components/dashboard/stats-grid", () => ({
  StatsGrid: ({ chainId }: { chainId: number }) => (
    <div data-testid="stats-grid">{chainId}</div>
  ),
}));

vi.mock("@/components/charts/equity-pool-chart", () => ({
  SupplyChart: ({ chainId }: { chainId: number }) => (
    <div data-testid="supply-chart">{chainId}</div>
  ),
}));

vi.mock("@/components/dashboard/liquidity-pairs", () => ({
  LiquidityPairsSection: ({ chainId }: { chainId: number }) => (
    <div data-testid="liquidity-pairs">{chainId}</div>
  ),
}));

vi.mock("@/components/charts/yield-chart", () => ({
  YieldChart: () => <div data-testid="yield-chart" />,
}));

describe("dashboard chain selection", () => {
  beforeEach(() => {
    account.chain = undefined;
    window.history.replaceState(null, "", "/en/dashboard/");
  });

  it("defaults to Ethereum and updates every chain-dependent panel", () => {
    const { rerender } = render(<DashboardOverview />);

    expect(screen.getByTestId("chain-selector")).toHaveTextContent("1");
    expect(screen.getByTestId("stats-grid")).toHaveTextContent("1");
    expect(screen.getByTestId("supply-chart")).toHaveTextContent("1");
    expect(screen.getByTestId("liquidity-pairs")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("chain-selector"));
    expect(window.location.search).toBe("?chain=137");
    // Next's history integration rerenders useSearchParams subscribers.
    rerender(<DashboardOverview />);

    expect(screen.getByTestId("chain-selector")).toHaveTextContent("137");
    expect(screen.getByTestId("stats-grid")).toHaveTextContent("137");
    expect(screen.getByTestId("supply-chart")).toHaveTextContent("137");
    expect(screen.getByTestId("liquidity-pairs")).toHaveTextContent("137");
  });

  it("starts on a supported connected wallet chain", () => {
    account.chain = { id: 8453 };

    render(<DashboardOverview />);

    expect(screen.getByTestId("chain-selector")).toHaveTextContent("8453");
    expect(screen.getByTestId("stats-grid")).toHaveTextContent("8453");
  });

  it("uses the linked chain for every panel ahead of the wallet chain", () => {
    account.chain = { id: 8453 };
    window.history.replaceState(null, "", "/en/dashboard/?chain=137");

    render(<DashboardOverview />);

    for (const panel of ["chain-selector", "stats-grid", "supply-chart", "liquidity-pairs"]) {
      expect(screen.getByTestId(panel)).toHaveTextContent(/^137$/);
    }
  });

  it.each(["", "invalid", "999999", "1.5"])("ignores an unsupported chain parameter: %s", (chain) => {
    account.chain = { id: 8453 };
    window.history.replaceState(null, "", `/en/dashboard/?chain=${chain}`);

    render(<DashboardOverview />);

    expect(screen.getByTestId("chain-selector")).toHaveTextContent(/^8453$/);
  });

  it("falls back to Ethereum for an unsupported wallet and URL chain", () => {
    account.chain = { id: 999999 };
    window.history.replaceState(null, "", "/en/dashboard/?chain=invalid");

    render(<DashboardOverview />);

    expect(screen.getByTestId("chain-selector")).toHaveTextContent(/^1$/);
  });

  it("keeps the locale, other parameters, and hash when selecting a chain", () => {
    window.history.replaceState(null, "", "/fr/dashboard/?chain=1&view=stats#supply");
    render(<DashboardOverview />);

    fireEvent.click(screen.getByTestId("chain-selector"));

    expect(window.location.pathname).toBe("/fr/dashboard/");
    expect(window.location.search).toBe("?chain=137&view=stats");
    expect(window.location.hash).toBe("#supply");
  });

  it("follows URL changes after a manual selection", () => {
    const { rerender } = render(<DashboardOverview />);
    fireEvent.click(screen.getByTestId("chain-selector"));
    rerender(<DashboardOverview />);
    expect(screen.getByTestId("stats-grid")).toHaveTextContent(/^137$/);

    window.history.replaceState(null, "", "/en/dashboard/?chain=8453");
    rerender(<DashboardOverview />);

    expect(screen.getByTestId("stats-grid")).toHaveTextContent(/^8453$/);
    expect(screen.getByTestId("supply-chart")).toHaveTextContent(/^8453$/);
    expect(screen.getByTestId("liquidity-pairs")).toHaveTextContent(/^8453$/);
  });
});
