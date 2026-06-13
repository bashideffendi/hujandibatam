import type { MetadataRoute } from "next";

// PWA-lite: cukup biar bisa "Add to Home Screen" + ikon rapi.
// SENGAJA tanpa service worker — radar itu data real-time, caching malah bikin basi.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hujan di Batam — Radar Hujan Real-time",
    short_name: "Hujan di Batam",
    description:
      "Radar hujan real-time Batam & sekitarnya. Sumber: Meteorological Service Singapore.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0d10",
    theme_color: "#0c0d10",
    lang: "id",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
