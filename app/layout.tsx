/* eslint-disable @next/next/no-page-custom-font --
   That rule targets the Pages Router. In the App Router the root layout loads
   fonts once for the whole app, and Google Fonts is loaded via <link> so the
   build never depends on network access. */
import type { Metadata, Viewport } from "next";

import "./globals.css";

/* -------------------------------------------------------------------------- */
/*  SEO / SOCIAL METADATA                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://cafecaption.vercel.app)
 * so Open Graph images and canonical URLs resolve correctly.
 * Add it in Vercel → Settings → Environment Variables.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

const title = "CafeCaption AI — Instagram captions for cafés, in seconds";
const description =
  "Describe your café photo and get three scroll-stopping Instagram captions, each with five trending hashtags. Built for independent coffee shops, bakeries and cafés.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s · CafeCaption AI",
  },
  description,
  applicationName: "CafeCaption AI",
  keywords: [
    "cafe instagram captions",
    "coffee shop captions",
    "instagram caption generator",
    "AI caption generator",
    "hashtag generator",
    "cafe marketing",
    "bakery social media",
    "restaurant captions",
  ],
  authors: [{ name: "Areeb" }],
  creator: "Areeb",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "CafeCaption AI",
    title,
    description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "business",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FDF5E9",
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
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
