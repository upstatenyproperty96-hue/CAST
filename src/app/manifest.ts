import type { MetadataRoute } from "next";

// Lets people add Cast to their phone's home screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cast",
    short_name: "Cast",
    description: "Video-first. Create, share, and grow on Cast.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
