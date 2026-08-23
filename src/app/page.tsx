import { LOCALES, DEFAULT_LOCALE } from "@/config/constants";

// Static export has no middleware, so `/` is a real page rather than a
// redirect. It ships its own <html> because the root layout is a pass-through
// (the locale layout owns the document for every other route).
export default function RootRedirectPage() {
  const script = `(function () {
    var locales = ${JSON.stringify(LOCALES)};
    var fallback = ${JSON.stringify(DEFAULT_LOCALE)};
    var target = fallback;
    var preferred = navigator.languages || [navigator.language];
    for (var i = 0; i < preferred.length; i++) {
      var tag = String(preferred[i] || "").toLowerCase();
      var base = tag.split("-")[0];
      if (locales.indexOf(tag) !== -1) { target = tag; break; }
      if (locales.indexOf(base) !== -1) { target = base; break; }
    }
    location.replace("/" + target + "/" + location.search + location.hash);
  })();`;

  return (
    <html lang={DEFAULT_LOCALE}>
      <head>
        <meta charSet="utf-8" />
        <meta name="robots" content="noindex" />
        <meta httpEquiv="refresh" content={`0; url=/${DEFAULT_LOCALE}/`} />
        <title>Fenix Protocol</title>
        <script dangerouslySetInnerHTML={{ __html: script }} />
      </head>
      <body>
        <a href={`/${DEFAULT_LOCALE}/`}>Continue to Fenix Protocol</a>
      </body>
    </html>
  );
}
