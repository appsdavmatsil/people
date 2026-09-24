import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "People",
    short_name: "People",
    description: "Staff management",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#063f3b",
    theme_color: "#063f3b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
