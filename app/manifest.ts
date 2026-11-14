import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CafeCaption",
    short_name: "CafeCaption",
    description:
      "Instagram captions and hashtags for independent cafés, in English or Hinglish.",
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
