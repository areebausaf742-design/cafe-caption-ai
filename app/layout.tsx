import type { Metadata, Viewport } from "next";

/*
 * Fonts are self-hosted (npm, not a runtime download): the two variable families
 * are imported here, fingerprinted into /_next/static, and served from our own
 * origin. That removes a third-party stylesheet from the critical path, removes
 * a render-blocking round trip before first paint, and lets the CSP drop
 * fonts.googleapis.com / fonts.gstatic.com entirely.
 */
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/plus-jakarta-sans";

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
      {/* No font <link> any more: the families are bundled CSS. Swap the two
          imports above + the stacks in app/globals.css to re-theme the app. */}
      <head>
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
