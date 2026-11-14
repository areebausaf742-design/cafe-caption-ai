import { ImageResponse } from "next/og";

/** iOS home-screen icon — espresso tile with the caramel monogram. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#241812",
          color: "#EDBB7C",
          fontSize: 112,
          fontWeight: 700,
          fontFamily: "serif",
          letterSpacing: -2,
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
