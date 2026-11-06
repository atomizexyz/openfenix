/** Routing rules belong to the chain, independently of its endpoint scan. */
export interface RpcPolicy {
  routing: "best" | "p2c";
  /** Concurrent idempotent reads. `false` uses one endpoint. */
  raceWidth: number | false;
  /** An additional backup only when the initial read is unusually slow. */
  hedge: false | { minDelay: number; multiplier: number };
  /** Per-attempt deadline, not a deadline for the entire failover sequence. */
  timeoutMs: number;
  retryCount: number;
  /** `false` disables batching; otherwise requires the scan's batch support. */
  batchWaitMs: number | false;
}

/**
 * Each chain has its own policy and smart transport state. Keep entries explicit
 * so a measured change on one chain never silently changes another chain.
 *
 * Two-way racing already selects the best-scored endpoints in smart-hyperevm;
 * `routing: "best"` also makes non-raced selection deterministic. Currently
 * JSON-RPC batching is disabled on every chain: either the scan found mixed
 * support, or live tests showed that even wait: 0 increased read latency.
 * Pools with at least three providers hedge a slow two-way race after 250ms
 * or twice its learned tail, whichever is longer. The extra request is only
 * sent while the initial race is still pending; singleton pools never hedge.
 * Timeouts and retry counts retain the library defaults until chain-specific
 * measurements justify changing them. An unavailable chain is not a fast one.
 */
export const RPC_POLICIES: Record<number, RpcPolicy> = {
  // Ethereum
  1: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    batchWaitMs: 0,
  },
  // Polygon
  137: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    batchWaitMs: 0,
  },
  // BNB Smart Chain
  56: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    batchWaitMs: 0,
  },
  // Avalanche
  43114: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    // Avoid the remaining 1–2ms median penalty observed with wait: 0.
    batchWaitMs: false,
  },
  // Moonbeam
  1284: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    // Onfinality's batched contract reads were slower than its direct reads.
    batchWaitMs: false,
  },
  // Evmos: retains its default RPC while the scanned pool is unavailable.
  9001: {
    routing: "best",
    raceWidth: false,
    hedge: false,
    timeoutMs: 10_000,
    retryCount: 2,
    batchWaitMs: false,
  },
  // Fantom
  250: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    // Single-call benchmarks show a remaining median penalty with wait: 0.
    batchWaitMs: false,
  },
  // Dogechain: retains its default RPC while the scanned pool is unavailable.
  2000: {
    routing: "best",
    raceWidth: false,
    hedge: false,
    timeoutMs: 10_000,
    retryCount: 2,
    batchWaitMs: false,
  },
  // OKC
  66: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    // Keep reads immediate; wait: 0 still schedules a JSON-RPC batch.
    batchWaitMs: false,
  },
  // EthereumPoW has one scanned provider; there is no second connection to race.
  10001: {
    routing: "best",
    raceWidth: false,
    hedge: false,
    timeoutMs: 10_000,
    retryCount: 2,
    // Avoid batching overhead on the sole connection.
    batchWaitMs: false,
  },
  // Base
  8453: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    // Batched reads retained a 3–5ms median penalty even with wait: 0.
    batchWaitMs: false,
  },
  // PulseChain
  369: {
    routing: "best",
    raceWidth: 2,
    hedge: { minDelay: 250, multiplier: 2 },
    timeoutMs: 10_000,
    retryCount: 2,
    batchWaitMs: 0,
  },
};
