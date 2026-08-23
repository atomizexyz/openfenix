/**
 * End-to-end verification: run the app's exact read pipeline (viem
 * readContracts -> Multicall3) against the top latency-ranked RPC endpoint
 * for every supported chain, using the project's own config.
 *
 * Run: bun run /tmp/verify-reads.ts
 */
import { createPublicClient, http, formatEther } from "viem";
import { FENIX_CHAINS } from "../src/config/chains";
import { GENERATED_RPC_ENDPOINTS } from "../src/config/rpc-endpoints.generated";
import { FENIX_ABI } from "../src/config/abi";

const FN = [
  "totalSupply",
  "equityPoolSupply",
  "equityPoolTotalShares",
  "rewardPoolSupply",
  "shareRate",
] as const;

const rows = await Promise.all(
  FENIX_CHAINS.map(async (cfg) => {
    const id = cfg.chain.id;
    const urls =
      GENERATED_RPC_ENDPOINTS[id]?.http ?? [...cfg.chain.rpcUrls.default.http];
    const start = Date.now();
    try {
      const client = createPublicClient({
        chain: cfg.chain,
        transport: http(urls[0], { timeout: 12_000 }),
      });
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
        return `${cfg.chain.name.padEnd(12)} PARTIAL  ${failed.length}/${FN.length} calls failed in multicall (${ms}ms)`;
      }
      const [supply, , , , shareRate] = results.map((r) => r.result as bigint);
      return `${cfg.chain.name.padEnd(12)} OK       1 multicall, ${FN.length} reads, ${String(ms).padStart(5)}ms  totalSupply=${Number(formatEther(supply)).toLocaleString("en-US", { maximumFractionDigits: 0 })}  shareRate=${formatEther(shareRate)}`;
    } catch (e) {
      const ms = Date.now() - start;
      return `${cfg.chain.name.padEnd(12)} FAIL     ${(e as Error).message.slice(0, 110)} (${ms}ms)`;
    }
  })
);

for (const row of rows) console.log(row);
