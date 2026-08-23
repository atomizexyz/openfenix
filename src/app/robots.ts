import type { MetadataRoute } from "next";
import { SITE_URL } from "@/config/site";

// Emitted as a static out/robots.txt by `output: "export"`.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Nothing here is private and there is no server to overload: a static
        // export on a CDN. Allowing every crawler, AI ones included, is the
        // whole point -- the protocol data is meant to be read.
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
