import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { LOCALES, RTL_LOCALES, type Locale } from "@/config/constants";
import { SITE_URL } from "@/config/site";
import { OG_IMAGE, TWITTER_HANDLE } from "@/lib/metadata";
import { CSP_CONTENT } from "@/lib/security";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic", "greek", "vietnamese"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

/**
 * Site-wide defaults. Per-page title, description, canonical and hreflang come
 * from each page's own generateMetadata (see src/lib/metadata.ts); anything set
 * there overrides what is declared here.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  referrer: "strict-origin-when-cross-origin",
  title: {
    default: "Fenix Protocol",
    template: "%s | Fenix Protocol",
  },
  description: "Burn XEN, Stake FENIX, Earn Trustless Yield",
  applicationName: "Fenix Protocol",
  openGraph: {
    siteName: "Fenix Protocol",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    images: [OG_IMAGE],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

// Painted behind the browser chrome on mobile; matches the hero either side of
// the theme so the status bar does not clash with the page.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(LOCALES, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const dir = RTL_LOCALES.includes(locale as Locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* Static export = no HTTP headers, so the CSP ships as a meta tag. */}
        <meta httpEquiv="Content-Security-Policy" content={CSP_CONTENT} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
