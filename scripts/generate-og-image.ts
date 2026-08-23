/**
 * Renders the Open Graph card to public/og.png.
 *
 * It has to be a real .png on disk. The Next `opengraph-image` file convention
 * serves the card from an extensionless route, and GitHub Pages types static
 * files purely by extension -- so it went out as application/octet-stream, which
 * Facebook, X, LinkedIn, Slack and Discord all refuse. There is no server here
 * to set a Content-Type header, so the extension is the only lever.
 *
 * Run with `bun run gen:og` after changing the design in src/lib/og-image.tsx.
 * og-image.test.ts checks the committed file still matches this output.
 */
import { ImageResponse } from "next/og";
import { writeFileSync } from "node:fs";
import { ogImageElement, size } from "../src/lib/og-image";

const response = new ImageResponse(ogImageElement(), { ...size });
const bytes = Buffer.from(await response.arrayBuffer());

writeFileSync(new URL("../public/og.png", import.meta.url), bytes);
console.log(`wrote public/og.png (${bytes.length} bytes, ${size.width}x${size.height})`);
