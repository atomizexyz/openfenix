/**
 * Writes public/llms.txt and public/llms-full.txt from src/lib/llms-txt.ts.
 * Run with `bun run gen:llms` after changing chains, locales, or protocol
 * constants. llms-txt.test.ts fails if the committed files drift from the
 * generators, so CI catches a forgotten regeneration.
 */
import { writeFileSync } from "node:fs";
import { buildLlmsTxt, buildLlmsFullTxt } from "../src/lib/llms-txt";

const targets = [
  ["public/llms.txt", buildLlmsTxt()],
  ["public/llms-full.txt", buildLlmsFullTxt()],
] as const;

for (const [relPath, contents] of targets) {
  writeFileSync(new URL(`../${relPath}`, import.meta.url), contents, "utf8");
  console.log(`wrote ${relPath} (${contents.length} bytes)`);
}
