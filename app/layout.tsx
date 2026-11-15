/* eslint-disable @next/next/no-page-custom-font --
   That rule targets the Pages Router. In the App Router the root layout loads
   fonts once for the whole app, and Google Fonts is loaded via <link> so the
   build never depends on network access. */
import type { Metadata, Viewport } from "next";

import AnalyticsProvider from "@/components/AnalyticsProvider";
import MotionRoot from "@/components/motion/MotionRoot";

import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_DISPLAY,
} from "@/lib/business";
import { siteDescription, siteName, siteTitle, siteUrl } from "@/lib/site";

import "./globals.css";

/* -------------------------------------------------------------------------- */
/*  SEO / SOCIAL METADATA                                                     */
/* -------------------------------------------------------------------------- */

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s · CafeCaption",
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "cafe instagram captions",
    "coffee shop captions",
    "instagram caption generator",
    "hashtag generator for cafes",
    "hinglish captions",
    "cafe website design india",
    "cafe marketing lucknow",
    "digital menu qr code cafe",
    "restaurant social media",
    "bakery instagram captions",
  ],
  authors: [{ name: "Areeb", url: siteUrl }],
  creator: "Areeb",
  publisher: siteName,
  alternates: { canonical: "/" },
  category: "business",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
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
    title: siteName,
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

/** Organisation + site data for search engines. */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: siteName,
      url: siteUrl,
      email: CONTACT_EMAIL,
      telephone: `+${CONTACT_PHONE}`,
      description:
        "Websites, digital menus and Instagram caption systems for independent cafés.",
      areaServed: "IN",
      founder: { "@type": "Person", name: "Areeb" },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      description: siteDescription,
      publisher: { "@id": `${siteUrl}/#organization` },
      inLanguage: "en-IN",
    },
    {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: "Areeb",
      telephone: CONTACT_PHONE_DISPLAY,
      email: CONTACT_EMAIL,
      worksFor: { "@id": `${siteUrl}/#organization` },
    },
  ],
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Without JS the reveal wrappers would never animate themselves in,
            so keep every section visible in that case. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
      </head>
      <body className="min-h-dvh font-sans">
        <AnalyticsProvider>
          <MotionRoot>
            <SiteHeader />
            {children}
            <SiteFooter />
          </MotionRoot>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
