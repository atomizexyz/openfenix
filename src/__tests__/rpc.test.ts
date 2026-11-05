import { describe, it, expect, vi, afterEach } from "vitest";
import type { HyperevmTransportValue } from "@bloxwap/smart-hyperevm";
import type { Transport } from "viem";
import { GENERATED_RPC_ENDPOINTS } from "@/config/rpc-endpoints.generated";
import { FENIX_CHAINS } from "@/config/chains";

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

type TransportInstance = ReturnType<Transport>;
type RpcBody = { id: number; method: string };

const smartValues = new Set<HyperevmTransportValue>();

function instantiate(transport: Transport): TransportInstance {
  const instance = transport({});
  const value = instance.value as Partial<HyperevmTransportValue>;
  if (typeof value.close === "function") {
    smartValues.add(value as HyperevmTransportValue);
  }
  return instance;
}

function smartValue(instance: TransportInstance): HyperevmTransportValue {
  return instance.value as HyperevmTransportValue;
}

function expectedReadUrls(chainId: number): string[] {
  const chain = FENIX_CHAINS.find((candidate) => candidate.chain.id === chainId)?.chain;
  if (!chain) throw new Error(`No test chain config for ${chainId}`);
  const generated = GENERATED_RPC_ENDPOINTS[chainId]?.http ?? [];
  return generated.length > 0 ? generated : [...chain.rpcUrls.default.http];
}

function expectEndpointLabel(configuredUrl: string, label: string): void {
  const [publicLabel, suffix] = label.split("#");
  expect([configuredUrl, new URL(configuredUrl).origin]).toContain(publicLabel);
  if (suffix !== undefined) expect(suffix).toMatch(/^\d+$/);
}

function fetchedUrl(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  throw new Error("Unexpected fetch input");
}

function rpcBody(init?: RequestInit): RpcBody {
  if (typeof init?.body !== "string") throw new Error("Expected a JSON-RPC body");
  return JSON.parse(init.body) as RpcBody;
}

function jsonRpcResponse(body: RpcBody, result: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function importRpc(blinkApiKey = "") {
  vi.stubEnv("NEXT_PUBLIC_BLINK_API_KEY", blinkApiKey);
  vi.resetModules();
  return import("@/config/rpc");
}

afterEach(() => {
  for (const value of smartValues) value.close();
  smartValues.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("GENERATED_RPC_ENDPOINTS", () => {
  it("has an entry for every deployment, including disabled ones", () => {
    for (const id of ALL_CHAIN_IDS) {
      expect(GENERATED_RPC_ENDPOINTS[id]).toBeDefined();
    }
    expect(Object.keys(GENERATED_RPC_ENDPOINTS)).toHaveLength(ALL_CHAIN_IDS.length);
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
  it("returns a working smart transport factory for every live chain", async () => {
    const { createChainTransport } = await importRpc();
    for (const id of EXPECTED_CHAIN_IDS) {
      const transport = createChainTransport(id);
      expect(typeof transport).toBe("function");
      expect(instantiate(transport).config.type).toBe("smartHyperevm");
    }
  });

  it("exposes every configured endpoint and the smart lifecycle API without Blink", async () => {
    const { createChainTransport } = await importRpc();
    for (const id of EXPECTED_CHAIN_IDS) {
      const instance = instantiate(createChainTransport(id));
      const value = smartValue(instance);
      const urls = expectedReadUrls(id);

      expect(instance.config.type).toBe("smartHyperevm");
      expect(value.endpoints).toHaveLength(urls.length);
      for (const [index, endpoint] of value.endpoints.entries()) {
        expectEndpointLabel(urls[index]!, endpoint.url);
      }
      expect(value.snapshot()).toHaveLength(urls.length);
      expect(typeof value.cacheStats).toBe("function");
      expect(value.cacheStats()).toMatchObject({
        hits: 0,
        misses: 0,
        refreshes: 0,
        entries: 0,
      });
      expect(typeof value.close).toBe("function");
    }
  });

  it("always configures at least one endpoint, even where the scan found none", async () => {
    const { createChainTransport } = await importRpc();
    for (const id of EXPECTED_CHAIN_IDS) {
      expect(smartValue(instantiate(createChainTransport(id))).endpoints.length).toBeGreaterThan(0);
    }
  });

  it("throws for a chain FENIX is not deployed on", async () => {
    const { createChainTransport } = await importRpc();
    expect(() => createChainTransport(999999)).toThrow(
      "No RPC config for chain 999999",
    );
  });
});

describe("MEV-protected writes", () => {
  it("covers exactly the FENIX chains BlinkLabs supports", async () => {
    const { BLINK_HOSTS } = await importRpc();
    expect(Object.keys(BLINK_HOSTS).map(Number).sort((a, b) => a - b)).toEqual(
      MEV_CHAIN_IDS,
    );
  });

  it("is inert without an API key", async () => {
    const { createChainTransport, hasMevProtection } = await importRpc();
    for (const id of MEV_CHAIN_IDS) {
      expect(hasMevProtection(id)).toBe(false);
      expect(instantiate(createChainTransport(id)).config.type).toBe("smartHyperevm");
    }
  });

  it("adds Blink to one top-level smart transport on every protected chain", async () => {
    const { BLINK_HOSTS, createChainTransport, hasMevProtection } =
      await importRpc("test-key");

    for (const id of MEV_CHAIN_IDS) {
      expect(hasMevProtection(id)).toBe(true);
      const instance = instantiate(createChainTransport(id));
      const endpoints = smartValue(instance).endpoints;
      const publicUrls = expectedReadUrls(id);
      const blinkUrl = `https://${BLINK_HOSTS[id]}.blinklabs.xyz/v1/test-key`;

      expect(instance.config.type).toBe("smartHyperevm");
      expect(endpoints).toHaveLength(publicUrls.length + 1);
      expect(endpoints[0]?.url).toBe(new URL(blinkUrl).origin);
      for (const [index, configuredUrl] of publicUrls.entries()) {
        expectEndpointLabel(configuredUrl, endpoints[index + 1]!.url);
      }
    }
  });

  it("sends writes only to Blink and reads only to public RPCs", async () => {
    const transactionHash = `0x${"ab".repeat(32)}`;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = rpcBody(init);
      if (body.method === "eth_chainId") return jsonRpcResponse(body, "0x3e7");
      if (body.method === "eth_sendRawTransaction") {
        return jsonRpcResponse(body, transactionHash);
      }
      if (body.method === "eth_getBalance") return jsonRpcResponse(body, "0x1");
      throw new Error(`Unexpected JSON-RPC method: ${body.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createChainTransport } = await importRpc("test-key");
    const ethereum = instantiate(createChainTransport(1));
    const blinkUrl = "https://eth.blinklabs.xyz/v1/test-key";

    await expect(
      ethereum.request({ method: "eth_sendRawTransaction", params: ["0x1234"] }),
    ).resolves.toBe(transactionHash);
    expect(fetchMock.mock.calls.map(([input]) => fetchedUrl(input))).toEqual([
      blinkUrl,
    ]);

    fetchMock.mockClear();
    await expect(
      ethereum.request({
        method: "eth_getBalance",
        params: ["0x0000000000000000000000000000000000000001", "latest"],
      }),
    ).resolves.toBe("0x1");

    const readUrls = fetchMock.mock.calls.map(([input]) => fetchedUrl(input));
    const readMethods = fetchMock.mock.calls.map(([, init]) => rpcBody(init).method);
    expect(readUrls.length).toBeGreaterThan(0);
    expect(readMethods).toContain("eth_getBalance");
    expect(readMethods).not.toContain("eth_sendRawTransaction");
    const normalizedPublicUrls = expectedReadUrls(1).map((url) => new URL(url).href);
    for (const url of readUrls) {
      expect(normalizedPublicUrls).toContain(new URL(url).href);
      expect(url).not.toBe(blinkUrl);
    }
  });

  it("leaves unprotected chains able to broadcast on public RPCs", async () => {
    const transactionHash = `0x${"ab".repeat(32)}`;
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = rpcBody(init);
      return jsonRpcResponse(
        body,
        body.method === "eth_chainId" ? "0x3e7" : transactionHash,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createChainTransport } = await importRpc("test-key");

    const polygon = instantiate(createChainTransport(137));
    await expect(
      polygon.request({ method: "eth_sendRawTransaction", params: ["0x1234"] }),
    ).resolves.toBe(transactionHash);
    const urls = fetchMock.mock.calls.map(([input]) => fetchedUrl(input));
    const normalizedPublicUrls = expectedReadUrls(137).map((url) => new URL(url).href);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(normalizedPublicUrls).toContain(new URL(url).href);
    }
  });
});

describe("chainTransports", () => {
  it("has a transport for every live chain and none for disabled ones", async () => {
    const { chainTransports } = await importRpc();
    for (const id of EXPECTED_CHAIN_IDS) {
      expect(typeof chainTransports[id]).toBe("function");
    }
    for (const id of DISABLED_CHAIN_IDS) {
      expect(chainTransports[id]).toBeUndefined();
    }
    expect(Object.keys(chainTransports).map(Number).sort((a, b) => a - b)).toEqual(
      [...EXPECTED_CHAIN_IDS].sort((a, b) => a - b),
    );
  });
});
