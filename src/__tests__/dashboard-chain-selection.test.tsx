import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

const { account } = vi.hoisted(() => ({
  account: {
    chain: undefined as { id: number } | undefined,
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => account,
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
  });

  it("defaults to Ethereum and updates every chain-dependent panel", () => {
    render(<DashboardOverview />);

    expect(screen.getByTestId("chain-selector")).toHaveTextContent("1");
    expect(screen.getByTestId("stats-grid")).toHaveTextContent("1");
    expect(screen.getByTestId("supply-chart")).toHaveTextContent("1");
    expect(screen.getByTestId("liquidity-pairs")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("chain-selector"));

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
});
