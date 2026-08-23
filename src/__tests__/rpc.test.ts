import { describe, it, expect, vi, afterEach } from "vitest";
import {
  BLINK_HOSTS,
  WRITE_METHODS,
  createChainTransport,
  chainTransports,
  hasMevProtection,
} from "@/config/rpc";
import { GENERATED_RPC_ENDPOINTS } from "@/config/rpc-endpoints.generated";

/** Every chain FENIX is deployed on, live or not. */
const ALL_CHAIN_IDS = [
  1, 137, 56, 43114, 1284, 9001, 250, 2000, 66, 10001, 8453, 369,
];

/**
 * Chains switched off in FENIX_CHAINS. Currently none: Evmos and Dogechain
 * have no reachable public RPC but are deliberately left on. Adding an id here
 * keeps the assertions below honest without touching them.
 */
const DISABLED_CHAIN_IDS: number[] = [];

/** Chains the app actually talks to. */
const EXPECTED_CHAIN_IDS = ALL_CHAIN_IDS.filter(
  (id) => !DISABLED_CHAIN_IDS.includes(id),
);

/** Chains BlinkLabs covers that also have a FENIX deployment. */
const MEV_CHAIN_IDS = [1, 56, 8453];

/** Reads a fallback transport's child transports without making a request. */
function childConfigs(transport: ReturnType<typeof createChainTransport>) {
  const { value } = transport({}) as {
    value?: { transports?: { config: { methods?: { include?: string[]; exclude?: string[] } } }[] };
  };
  return (value?.transports ?? []).map((t) => t.config);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("GENERATED_RPC_ENDPOINTS", () => {
  it("has an entry for every deployment, including disabled ones", () => {
    for (const id of ALL_CHAIN_IDS) {
      expect(GENERATED_RPC_ENDPOINTS[id]).toBeDefined();
    }
    expect(Object.keys(GENERATED_RPC_ENDPOINTS)).toHaveLength(12);
  });

  it("only lists https endpoints", () => {
    for (const config of Object.values(GENERATED_RPC_ENDPOINTS)) {
      for (const url of config.http) {
        expect(url).toMatch(/^https:\/\//);
      }
    }
  });

  it("never lists an endpoint needing a credential placeholder", () => {
    for (const config of Object.values(GENERATED_RPC_ENDPOINTS)) {
      for (const url of config.http) {
        expect(url).not.toContain("${");
      }
    }
  });
});

describe("createChainTransport", () => {
  it("returns a transport for every live chain", () => {
    for (const id of EXPECTED_CHAIN_IDS) {
      expect(typeof createChainTransport(id)).toBe("function");
    }
  });

  it("throws for a chain FENIX is not deployed on", () => {
    expect(() => createChainTransport(999999)).toThrow(
      "No RPC config for chain 999999",
    );
  });

  it("always produces at least one endpoint, even where the scan found none", () => {
    // Evmos and Dogechain have no reachable public RPCs; they must still fall
    // back to viem's defaults rather than yielding an empty fallback list.
    for (const id of EXPECTED_CHAIN_IDS) {
      expect(childConfigs(createChainTransport(id)).length).toBeGreaterThan(0);
    }
  });
});

describe("MEV-protected writes", () => {
  it("covers exactly the FENIX chains BlinkLabs supports", () => {
    expect(Object.keys(BLINK_HOSTS).map(Number).sort((a, b) => a - b)).toEqual(
      MEV_CHAIN_IDS,
    );
  });

  it("is inert without an API key", () => {
    for (const id of MEV_CHAIN_IDS) {
      expect(hasMevProtection(id)).toBe(false);
    }
  });

  it("routes only write methods to Blink and excludes them elsewhere", async () => {
    vi.stubEnv("NEXT_PUBLIC_BLINK_API_KEY", "test-key");
    vi.resetModules();
    const rpc = await import("@/config/rpc");

    const configs = childConfigs(rpc.createChainTransport(1));
    const [mev, ...reads] = configs;

    expect(mev.methods).toEqual({ include: [...WRITE_METHODS] });
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.methods).toEqual({ exclude: [...WRITE_METHODS] });
    }
  });

  it("leaves unprotected chains able to broadcast on public RPCs", async () => {
    vi.stubEnv("NEXT_PUBLIC_BLINK_API_KEY", "test-key");
    vi.resetModules();
    const rpc = await import("@/config/rpc");

    // Polygon has no Blink endpoint, so nothing may filter out writes.
    for (const config of childConfigs(rpc.createChainTransport(137))) {
      expect(config.methods).toBeUndefined();
    }
  });
});

describe("chainTransports", () => {
  it("has a transport for every live chain and none for disabled ones", () => {
    for (const id of EXPECTED_CHAIN_IDS) {
      expect(typeof chainTransports[id]).toBe("function");
    }
    for (const id of DISABLED_CHAIN_IDS) {
      expect(chainTransports[id]).toBeUndefined();
    }
    expect(Object.keys(chainTransports)).toHaveLength(EXPECTED_CHAIN_IDS.length);
  });
});
