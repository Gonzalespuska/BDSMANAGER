import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/**
 * PWA manifest — umožní "Install to home screen" na iOS/Android.
 * Po pridaní na home screen sa appka spustí bez browser chrome (full-screen).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Epoxidovo Manager CRM",
    short_name: "Epoxidovo CRM",
    description: "Interný CRM pre obchodný tím Epoxidovo",
    start_url: "/agent",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0ea5e9",
    lang: "sk-SK",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    categories: ["business", "productivity"],
    scope: "/",
  };
}
