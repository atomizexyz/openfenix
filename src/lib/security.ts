/**
 * Content-Security-Policy delivered as a <meta http-equiv> tag.
 *
 * The site is a static export on GitHub Pages, so no HTTP response headers
 * can be set -- a meta CSP is the only option. Meta delivery means
 * frame-ancestors and report-uri are unavailable; those need a host with
 * header control.
 *
 * The policy is deliberately strict where it matters for XSS (script-src,
 * object-src, base-uri, form-action) and permissive where a static dApp has
 * legitimate needs: connect-src allows any https/wss because the client talks
 * to dozens of scanned public RPC endpoints plus WalletConnect relays, and
 * frame-src allows https because wallet connectors may sandbox themselves in
 * iframes. script-src keeps 'unsafe-inline' for the locale-redirect script on
 * the root page and next-themes' hydration script.
 */
export const CSP_CONTENT = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
