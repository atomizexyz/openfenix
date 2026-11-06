/**
 * End-to-end verification: run the app's exact read pipeline (viem
 * readContracts -> Multicall3) through every supported chain's smart transport.
 *
 * Run: bun run scripts/verify-reads.ts
 */
import { createPublicClient, formatEther } from "viem";
import { FENIX_CHAINS } from "../src/config/chains";
import { FENIX_ABI } from "../src/config/abi";
import { createChainTransport } from "../src/config/rpc";

const FN = [
  "totalSupply",
  "equityPoolSupply",
  "equityPoolTotalShares",
  "rewardPoolSupply",
  "shareRate",
] as const;

const rows = await Promise.all(
  FENIX_CHAINS.map(async (cfg) => {
    const start = Date.now();
    const client = createPublicClient({
      chain: cfg.chain,
      transport: createChainTransport(cfg.chain.id),
    });
    try {
      const results = await client.multicall({
        contracts: FN.map((functionName) => ({
          address: cfg.fenixContract,
          abi: FENIX_ABI,
          functionName,
        })),
      });
      const failed = results.filter((r) => r.status === "failure");
      const ms = Date.now() - start;
      if (failed.length > 0) {
        process.exitCode = 1;
        return `${cfg.chain.name.padEnd(12)} PARTIAL  ${failed.length}/${FN.length} calls failed in multicall (${ms}ms)`;
      }
      const [supply, , , , shareRate] = results.map((r) => r.result as bigint);
      return `${cfg.chain.name.padEnd(12)} OK       1 multicall, ${FN.length} reads, ${String(ms).padStart(5)}ms  totalSupply=${Number(formatEther(supply)).toLocaleString("en-US", { maximumFractionDigits: 0 })}  shareRate=${formatEther(shareRate)}`;
    } catch (e) {
      process.exitCode = 1;
      const ms = Date.now() - start;
      return `${cfg.chain.name.padEnd(12)} FAIL     ${(e as Error).message.slice(0, 110)} (${ms}ms)`;
    } finally {
      const transport = client.transport as { close?: () => void };
      transport.close?.();
    }
  })
);

for (const row of rows) console.log(row);
