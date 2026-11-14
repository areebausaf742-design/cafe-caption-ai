import { ImageResponse } from "next/og";

/**
 * Open Graph / Twitter preview image (1200×630).
 * Rendered at build time by Satori — no external assets or fonts needed.
 */
export const alt =
  "CafeCaption — Instagram captions for cafés, in English and Hinglish";
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
              borderRadius: 18,
              background: "#241812",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#EDBB7C",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            C
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
            CafeCaption
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
            Instagram studio for cafés
          </div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.06,
              maxWidth: 960,
            }}
          >
            <span>Captions that make people</span>
            <span style={{ color: "#A9632C", marginLeft: 20 }}>walk in.</span>
          </div>
          <div
            style={{
              fontSize: 29,
              lineHeight: 1.35,
              color: "#6B5544",
              maxWidth: 840,
              display: "flex",
            }}
          >
            Three considered captions and five researched hashtags — in English
            or Hinglish.
          </div>
        </div>

        {/* hashtag pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["#cafelife", "#latteart", "#slowmornings", "#cafevibes"].map(
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
            English · Hinglish
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
