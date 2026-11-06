/** Check the exported landing page's critical downloads after `bun run build`. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const output = resolve("out");
const html = readFileSync(resolve(output, "en/index.html"), "utf8");
const scripts = new Set(
  [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]),
);
if (scripts.size === 0) throw new Error("No scripts found in the exported landing page");

let rawBytes = 0;
let gzipBytes = 0;
for (const script of scripts) {
  const content = readFileSync(resolve(output, `.${script}`));
  rawBytes += content.length;
  gzipBytes += gzipSync(content).length;
}
const fontPreloads = [...html.matchAll(/<link\b[^>]*\bas="font"/g)].length;

console.log(JSON.stringify({ scripts: scripts.size, rawBytes, gzipBytes, fontPreloads }, null, 2));

// The optimized page is ~381 KB gzipped. Leave headroom for routine changes,
// while catching an eager wallet SDK or chart library re-entering the page.
if (gzipBytes > 450_000) {
  throw new Error(`Initial JavaScript exceeds the 450 KB gzip budget: ${gzipBytes} bytes`);
}
if (fontPreloads > 1) {
  throw new Error(`Only the primary text font should preload; found ${fontPreloads}`);
}
