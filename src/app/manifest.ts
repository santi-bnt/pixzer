import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pixzer",
    short_name: "pixzer",
    description: "Your private library for legally obtained retro games.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#d71920",
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
