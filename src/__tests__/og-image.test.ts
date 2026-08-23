import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { OG_IMAGE } from "@/lib/metadata";
import { size, alt } from "@/lib/og-image";

/**
 * The card has to be a real .png. GitHub Pages types static files purely by
 * extension, so an extensionless file goes out as application/octet-stream and
 * every major crawler refuses it -- which is exactly what the old
 * `opengraph-image` route did.
 */
describe("open graph image", () => {
  const bytes = readFileSync(
    resolve(__dirname, "..", "..", "public", "og.png")
  );

  it("is committed as a real PNG", () => {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.subarray(0, 8).equals(signature)).toBe(true);
  });

  it("matches the declared dimensions", () => {
    // IHDR width/height live at bytes 16..24 of every PNG.
    expect(bytes.readUInt32BE(16)).toBe(size.width);
    expect(bytes.readUInt32BE(20)).toBe(size.height);
  });

  it("is the 1200x630 that Open Graph expects", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(OG_IMAGE.width).toBe(size.width);
    expect(OG_IMAGE.height).toBe(size.height);
  });

  it("is referenced by a path that carries the .png extension", () => {
    // The whole point: without the extension GitHub Pages mistypes it.
    expect(OG_IMAGE.url.endsWith(".png")).toBe(true);
  });

  it("keeps the alt text in sync with the design", () => {
    expect(OG_IMAGE.alt).toBe(alt);
  });

  it("stays small enough for crawlers that cap card size", () => {
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
  });
});
