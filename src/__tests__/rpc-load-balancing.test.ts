import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicClient, type Chain, type Transport } from "viem";
import { createChainTransport } from "@/config/rpc";
import { FENIX_CHAINS } from "@/config/chains";
import { GENERATED_RPC_ENDPOINTS } from "@/config/rpc-endpoints.generated";

interface RpcRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

interface RecordedCall {
  url: string;
  method: string;
  params?: unknown;
}

type RpcHandler = (
  url: string,
  request: RpcRequest,
) => unknown | Promise<unknown>;

const openTransports: unknown[] = [];

const polygon = FENIX_CHAINS.find(({ chain }) => chain.id === 137)!.chain;
const mainnet = FENIX_CHAINS.find(({ chain }) => chain.id === 1)!.chain;
const readParams = [
  {
    to: "0x000000000000000000000000000000000000dEaD",
    data: "0x",
  },
  "latest",
] as const;

function mockRpc(handler: RpcHandler): RecordedCall[] {
  const calls: RecordedCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const body = JSON.parse(String(init?.body)) as RpcRequest | RpcRequest[];
      const requests = Array.isArray(body) ? body : [body];

      for (const request of requests) {
        calls.push({ url, method: request.method, params: request.params });
      }

      const responses = await Promise.all(
        requests.map(async (request) => ({
          jsonrpc: "2.0",
          id: request.id,
          result: await handler(url, request),
        })),
      );

      return new Response(
        JSON.stringify(Array.isArray(body) ? responses : responses[0]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }),
  );

  return calls;
}

function makeClient(chain: Chain, transport = createChainTransport(chain.id)) {
  const client = createPublicClient({
    chain,
    transport,
  });
  openTransports.push(client.transport);
  return client;
}

function closeTransport(value: unknown, seen = new Set<object>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);

  const transport = value as {
    close?: unknown;
    transports?: unknown;
    value?: unknown;
  };
  if (typeof transport.close === "function") {
    (transport.close as () => void)();
  }
  if (Array.isArray(transport.transports)) {
    for (const child of transport.transports) closeTransport(child, seen);
  }
  closeTransport(transport.value, seen);
}

function smartValue(client: ReturnType<typeof makeClient>) {
  return client.transport as unknown as {
    snapshot: () => readonly { url: string; quarantined: boolean }[];
    cacheStats: () => { hits: number; misses: number; entries: number };
  };
}

afterEach(() => {
  for (const transport of openTransports.splice(0)) closeTransport(transport);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("createChainTransport smart RPC behavior", () => {
  it("checks the client chain and quarantines a wrong-chain endpoint before reading", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const wrongUrl = new URL(
      GENERATED_RPC_ENDPOINTS[polygon.id].http[0]!,
    ).toString();
    const calls = mockRpc((url, { method }) => {
      if (method === "eth_chainId") return url === wrongUrl ? "0x1" : "0x89";
      if (method === "eth_call") return "0x1234";
      return null;
    });
    const client = makeClient(polygon);

    await expect(
      client.request({ method: "eth_call", params: readParams }),
    ).resolves.toBe("0x1234");

    const wrongCalls = calls.filter(({ url }) => url === wrongUrl);
    expect(wrongCalls.some(({ method }) => method === "eth_chainId")).toBe(true);
    expect(wrongCalls.every(({ method }) => method !== "eth_call")).toBe(true);

    const reads = calls.filter(({ method }) => method === "eth_call");
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) {
      expect(read.url).not.toBe(wrongUrl);
      expect(
        calls.some(
          ({ url, method }) => url === read.url && method === "eth_chainId",
        ),
      ).toBe(true);
    }
    expect(
      smartValue(client)
        .snapshot()
        .find(({ url }) => url === new URL(wrongUrl).origin)?.quarantined,
    ).toBe(true);
  });

  it("coalesces identical concurrent reads into one upstream read", async () => {
    let releaseRead!: (result: string) => void;
    let signalRead!: () => void;
    const readPending = new Promise<string>((resolve) => {
      releaseRead = resolve;
    });
    const readStarted = new Promise<void>((resolve) => {
      signalRead = resolve;
    });
    let readCount = 0;

    mockRpc((_url, { method }) => {
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_call") {
        readCount += 1;
        signalRead();
        return readPending;
      }
      return null;
    });
    const client = makeClient(polygon);

    const first = client.request({ method: "eth_call", params: readParams });
    const second = client.request({ method: "eth_call", params: readParams });
    await readStarted;
    releaseRead("0xabcdef");

    await expect(Promise.all([first, second])).resolves.toEqual([
      "0xabcdef",
      "0xabcdef",
    ]);
    expect(readCount).toBe(1);
  });

  it("sends both sequential identical reads upstream with caching disabled", async () => {
    const calls = mockRpc((_url, { method }) => {
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_call") return "0x1234";
      return null;
    });
    const client = makeClient(polygon);
    const request = () =>
      client.request({ method: "eth_call", params: readParams });

    await expect(request()).resolves.toBe("0x1234");
    const readsAfterFirst = calls.filter(
      ({ method }) => method === "eth_call",
    ).length;
    expect(readsAfterFirst).toBeGreaterThan(0);

    await expect(request()).resolves.toBe("0x1234");
    const readsAfterSecond = calls.filter(
      ({ method }) => method === "eth_call",
    ).length;
    expect(readsAfterSecond).toBeGreaterThan(readsAfterFirst);
    expect(smartValue(client).cacheStats()).toMatchObject({
      hits: 0,
      misses: 0,
      entries: 0,
    });
  });

  it("preserves latest on eth_call after learning a block head", async () => {
    const calls = mockRpc((_url, { method }) => {
      if (method === "eth_chainId") return "0x89";
      if (method === "eth_blockNumber") return "0x123";
      if (method === "eth_call") return "0x1234";
      return null;
    });
    const client = makeClient(polygon);

    await expect(client.request({ method: "eth_blockNumber" })).resolves.toBe(
      "0x123",
    );
    await expect(
      client.request({ method: "eth_call", params: readParams }),
    ).resolves.toBe("0x1234");

    const reads = calls.filter(({ method }) => method === "eth_call");
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read.params).toEqual(readParams);
  });

  it("routes Blink writes separately from smart public reads", async () => {
    vi.stubEnv("NEXT_PUBLIC_BLINK_API_KEY", "test-key");
    vi.resetModules();
    const { createChainTransport: createBlinkTransport } = await import(
      "@/config/rpc"
    );
    const blinkOrigin = "https://eth.blinklabs.xyz";
    const transactionHash = `0x${"ab".repeat(32)}`;
    const calls = mockRpc((_url, { method }) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_call") return "0x1234";
      if (method === "eth_sendRawTransaction") return transactionHash;
      return null;
    });
    const client = makeClient(
      mainnet,
      createBlinkTransport(mainnet.id) as Transport,
    );

    await expect(
      client.request({ method: "eth_call", params: readParams }),
    ).resolves.toBe("0x1234");
    await expect(
      client.request({
        method: "eth_sendRawTransaction",
        params: ["0x02f8b0010180"],
      }),
    ).resolves.toBe(transactionHash);

    const blinkCalls = calls.filter(({ url }) => url.startsWith(blinkOrigin));
    expect(blinkCalls.map(({ method }) => method)).toEqual([
      "eth_sendRawTransaction",
    ]);
    const publicCalls = calls.filter(({ url }) => !url.startsWith(blinkOrigin));
    expect(publicCalls.some(({ method }) => method === "eth_call")).toBe(true);
    expect(
      publicCalls.every(({ method }) => method !== "eth_sendRawTransaction"),
    ).toBe(true);
  });
});
