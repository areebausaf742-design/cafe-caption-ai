import { ImageResponse } from "next/og";

import { siteDescription } from "@/lib/site";

/**
 * Open Graph / Twitter preview image (1200×630).
 * Rendered at build time by Satori — no external assets or fonts needed.
 */
export const alt =
  "CafeCaption AI — three Instagram captions and five hashtags for your café in seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background:
            "radial-gradient(900px 600px at 8% -10%, #F6D7AC 0%, #FDF5E9 55%, #FDF5E9 100%)",
          color: "#241812",
          fontFamily: "sans-serif",
        }}
      >
        {/* brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "#241812",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#EDBB7C",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            CC
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: -0.5,
            }}
          >
            <span>CafeCaption</span>
            <span style={{ color: "#A9632C" }}>AI</span>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 20px",
              borderRadius: 999,
              border: "1px solid rgba(36,24,18,0.14)",
              background: "rgba(255,255,255,0.65)",
              fontSize: 20,
              fontWeight: 600,
              color: "#4A3527",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#7D9668",
                display: "flex",
              }}
            />
            Caption studio for café owners
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 78,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.06,
              maxWidth: 940,
            }}
          >
            <span>Turn your café photos into</span>
            <span style={{ color: "#A9632C", marginLeft: 20 }}>
              captions that sell.
            </span>
          </div>
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: "#6B5544",
              maxWidth: 820,
              display: "flex",
            }}
          >
            {siteDescription.split(". ")[0]}. English or Hinglish.
          </div>
        </div>

        {/* hashtag pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["#cafelife", "#latteart", "#hinglishcaptions", "#cafevibes"].map(
            (tag) => (
              <div
                key={tag}
                style={{
                  display: "flex",
                  padding: "12px 22px",
                  borderRadius: 14,
                  background: "#FBEBD3",
                  color: "#A9632C",
                  fontSize: 24,
                  fontWeight: 600,
                }}
              >
                {tag}
              </div>
            ),
          )}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              flexShrink: 0,
              whiteSpace: "nowrap",
              fontSize: 22,
              fontWeight: 600,
              color: "#6B5544",
            }}
          >
            3 captions · 5 hashtags
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
