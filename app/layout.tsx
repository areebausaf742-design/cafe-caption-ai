/* eslint-disable @next/next/no-page-custom-font --
   That rule targets the Pages Router. In the App Router the root layout loads
   fonts once for the whole app, and Google Fonts is loaded via <link> so the
   build never depends on network access. */
import type { Metadata, Viewport } from "next";

import { siteDescription, siteName, siteTitle, siteUrl } from "@/lib/site";

import "./globals.css";

/* -------------------------------------------------------------------------- */
/*  SEO / SOCIAL METADATA                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://cafecaption.vercel.app)
 * so canonical URLs, the sitemap and the Open Graph image resolve correctly.
 * Add it in Vercel → Settings → Environment Variables.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s · CafeCaption AI",
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "cafe instagram captions",
    "coffee shop captions",
    "instagram caption generator",
    "hashtag generator",
    "hinglish captions",
    "cafe marketing",
    "bakery social media",
    "restaurant captions",
    "AI caption generator",
    "instagram captions for cafes",
  ],
  authors: [{ name: "Areeb", url: siteUrl }],
  creator: "Areeb",
  publisher: "CafeCaption AI",
  alternates: { canonical: "/" },
  category: "business",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    creator: "@areeb",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: "CafeCaption AI",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  // app/opengraph-image.tsx is picked up automatically for OG + Twitter.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#FDF5E9",
  colorScheme: "light",
};

/** Structured data helps Google show the tool with rich details. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteName,
  url: siteUrl,
  description: siteDescription,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: ["en", "hi-Latn"],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "AI Instagram captions for cafés",
    "Five trending hashtags per caption",
    "English and Hinglish captions",
    "One-tap copy to clipboard",
  ],
  creator: { "@type": "Person", name: "Areeb" },
};

/* -------------------------------------------------------------------------- */
/*  ROOT LAYOUT                                                               */
/* -------------------------------------------------------------------------- */

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Fonts load from Google Fonts at runtime (no build-time fetch needed).
          Swap the two families here + in app/globals.css to re-theme the app. */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
        <script
          type="application/ld+json"
          // JSON.stringify keeps this safe; content is a trusted constant.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
