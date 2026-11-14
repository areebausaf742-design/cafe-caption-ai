import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CafeCaption AI",
    short_name: "CafeCaption",
    description:
      "Turn café photos into Instagram captions and hashtags in seconds, in English or Hinglish.",
    start_url: "/",
    display: "standalone",
    background_color: "#FDF5E9",
    theme_color: "#241812",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
