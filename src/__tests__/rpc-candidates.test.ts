import { describe, expect, it } from "vitest";
import { FENIX_CHAINS } from "@/config/chains";
import { RPC_ENDPOINT_CANDIDATES } from "@/config/rpc-candidates";

const enabledChainIds = FENIX_CHAINS.filter(({ enabled }) => enabled).map(
  ({ chain }) => chain.id,
);

const credentialQueryParameter = /^(?:.*apikey|key|token|accesstoken|auth|authorization|secret|credential|projectid)$/;

describe("RPC_ENDPOINT_CANDIDATES", () => {
  it("covers exactly the enabled FENIX chain IDs", () => {
    expect(Object.keys(RPC_ENDPOINT_CANDIDATES).map(Number).sort((a, b) => a - b)).toEqual(
      [...enabledChainIds].sort((a, b) => a - b),
    );
  });

  it("has at least one candidate for every enabled chain", () => {
    for (const chainId of enabledChainIds) {
      const candidates = RPC_ENDPOINT_CANDIDATES[chainId];
      expect(candidates, `chain ${chainId} candidates`).toBeDefined();
      expect(Array.isArray(candidates), `chain ${chainId} candidates`).toBe(true);
      expect(candidates.length, `chain ${chainId} candidates`).toBeGreaterThan(0);
    }
  });

  it("uses only valid credential-free HTTPS URLs", () => {
    for (const [chainId, candidates] of Object.entries(RPC_ENDPOINT_CANDIDATES)) {
      for (const candidate of candidates) {
        const context = `chain ${chainId} candidate ${candidate}`;
        const url = new URL(candidate);

        expect(url.protocol, context).toBe("https:");
        expect(url.username, context).toBe("");
        expect(url.password, context).toBe("");
        expect(candidate, context).not.toMatch(/\$\{[^}]*\}/);

        for (const segment of url.pathname.split("/")) {
          expect(segment, context).not.toMatch(
            /^(?:[0-9a-f]{24,}|[a-z0-9_-]{32,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i,
          );
        }
        for (const name of url.searchParams.keys()) {
          const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
          expect(normalizedName, `${context} query parameter ${name}`).not.toMatch(
            credentialQueryParameter,
          );
        }
      }
    }
  });

  it("has no duplicate URLs within a chain", () => {
    for (const [chainId, candidates] of Object.entries(RPC_ENDPOINT_CANDIDATES)) {
      const normalizedUrls = candidates.map((candidate) => new URL(candidate).href);
      expect(new Set(normalizedUrls).size, `chain ${chainId} candidates`).toBe(
        candidates.length,
      );
    }
  });
});
