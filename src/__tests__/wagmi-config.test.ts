import { describe, it, expect, vi, afterEach } from "vitest";
import type { Chain, Transport } from "viem";

type TransportInstance = ReturnType<Transport>;
type ClosableTransportValue = {
  close?: () => void;
  transports?: TransportInstance[];
};

const MEV_CHAIN_IDS = [1, 56, 8453];
const transportRoots = new Set<TransportInstance>();
const clientTransportValues = new Set<ClosableTransportValue>();
const closedTransportValues = new Set<ClosableTransportValue>();

function trackTransport(instance: TransportInstance) {
  transportRoots.add(instance);
  return instance;
}

function trackClientTransport(value: object) {
  clientTransportValues.add(value as ClosableTransportValue);
}

function closeTransportValue(value: ClosableTransportValue) {
  if (closedTransportValues.has(value)) return;
  closedTransportValues.add(value);
  value.close?.();
  for (const child of value.transports ?? []) closeTransport(child);
}

function closeTransport(instance: TransportInstance) {
  const value = instance.value as ClosableTransportValue | undefined;
  if (value) closeTransportValue(value);
}

function instantiate(transport: Transport, chain: Chain) {
  return trackTransport(transport({ chain }));
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonRpcResponse(body: BodyInit | null | undefined, chainId: number) {
  const payload = JSON.parse(String(body)) as
    | { id: number; method: string }
    | { id: number; method: string }[];
  const requests = Array.isArray(payload) ? payload : [payload];
  const responses = requests.map((request) => {
    let result: string;
    switch (request.method) {
      case "eth_chainId":
        result = `0x${chainId.toString(16)}`;
        break;
      case "eth_blockNumber":
        result = "0x1";
        break;
      case "eth_getBalance":
        result = "0x2a";
        break;
      default:
        throw new Error(`Unexpected JSON-RPC method: ${request.method}`);
    }
    return { jsonrpc: "2.0", id: request.id, result };
  });

  return new Response(
    JSON.stringify(Array.isArray(payload) ? responses : responses[0]),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  for (const transport of transportRoots) closeTransport(transport);
  for (const value of clientTransportValues) closeTransportValue(value);
  transportRoots.clear();
  clientTransportValues.clear();
  closedTransportValues.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadWithBlinkKey() {
  vi.stubEnv("NEXT_PUBLIC_BLINK_API_KEY", "test-key");
  vi.resetModules();
  const wagmi = await import("@/lib/wagmi");
  const { wagmiAdapter } = await import("@/lib/wallet-adapter");
  const rpc = await import("@/config/rpc");
  const { SUPPORTED_CHAINS } = await import("@/config/chains");
  return { ...wagmi, wagmiAdapter, ...rpc, SUPPORTED_CHAINS };
}

describe("wagmi config behind AppKit", () => {
  it("attaches the deferred wallet to the existing read config and clients", async () => {
    vi.resetModules();
    const { config } = await import("@/lib/wagmi");
    const client = config.getClient({ chainId: 1 });
    trackClientTransport(client.transport);

    const { wagmiAdapter } = await import("@/lib/wallet-adapter");
    expect(wagmiAdapter.wagmiConfig).toBe(config);
    expect(wagmiAdapter.wagmiConfig.getClient({ chainId: 1 })).toBe(client);
  });

  it("uses our chain transports verbatim, not AppKit's wrapped ones", async () => {
    const { config, chainTransports, SUPPORTED_CHAINS } = await loadWithBlinkKey();

    for (const chain of SUPPORTED_CHAINS) {
      expect(config._internal.transports[chain.id]).toBe(chainTransports[chain.id]);
    }
  });

  it("uses one smartHyperevm transport on every chain", async () => {
    const { chainTransports, SUPPORTED_CHAINS } = await loadWithBlinkKey();

    for (const chain of SUPPORTED_CHAINS) {
      const instance = instantiate(chainTransports[chain.id], chain);
      expect(instance.config.type).toBe("smartHyperevm");
    }
  });

  it("serves reads through public endpoints on every chain", async () => {
    const { config, SUPPORTED_CHAINS } = await loadWithBlinkKey();
    const requests: { url: string; body: string }[] = [];
    let expectedChainId = 1;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = String(init?.body);
        requests.push({ url: requestUrl(input), body });
        return jsonRpcResponse(init?.body, expectedChainId);
      }),
    );

    for (const chain of SUPPORTED_CHAINS) {
      expectedChainId = chain.id;
      const requestCount = requests.length;
      const client = config.getClient({ chainId: chain.id });
      trackClientTransport(client.transport);

      await expect(
        client.request({
          method: "eth_getBalance",
          params: ["0x0000000000000000000000000000000000000001", "0x1"],
        }),
      ).resolves.toBe("0x2a");

      const chainRequests = requests.slice(requestCount);
      expect(
        chainRequests.some(({ body }) => body.includes("eth_getBalance")),
      ).toBe(true);
      expect(
        chainRequests.every(
          ({ url }) =>
            !url.includes("blinklabs.xyz") &&
            !url.includes("walletconnect") &&
            !url.includes("reown"),
        ),
      ).toBe(true);
    }
  });

  it("never broadcasts a raw transaction to public or Reown RPCs when Blink fails", async () => {
    const { config, BLINK_HOSTS, WRITE_METHODS } = await loadWithBlinkKey();
    const requests: { url: string; body: string }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: requestUrl(input), body: String(init?.body) });
        throw new TypeError("network down");
      }),
    );

    for (const chainId of MEV_CHAIN_IDS) {
      const client = config.getClient({ chainId });
      trackClientTransport(client.transport);
      const blinkUrl = `https://${BLINK_HOSTS[chainId]}.blinklabs.xyz/v1/test-key`;

      for (const method of WRITE_METHODS) {
        const requestCount = requests.length;
        await expect(
          client.request({ method, params: ["0x00"] } as never),
        ).rejects.toThrow();

        const attempts = requests
          .slice(requestCount)
          .filter(({ body }) => body.includes(`"method":"${method}"`));
        expect(attempts.length).toBeGreaterThan(0);
        expect(
          attempts.every(({ url }) => url === blinkUrl),
          JSON.stringify(attempts),
        ).toBe(true);
        expect(
          attempts.some(
            ({ url }) => url.includes("walletconnect") || url.includes("reown"),
          ),
        ).toBe(false);
      }
    }
  }, 15_000);
});
