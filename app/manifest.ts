import type { MetadataRoute } from "next";

// PWA: manifest buat "Add to Home Screen" + ikon. SW minimal ADA (public/sw.js,
// didaftar via ServiceWorkerRegister): data real-time = network-only ANTI-BASI,
// shell statis content-hashed = cache-first (dipangkas, lihat sw.js).
// orientation "any": video CCTV 16:9 boleh ditonton landscape (panel punya layout
// landscape sendiri di globals.css).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Hujan di Batam — Radar Hujan, Ombak & CCTV",
    short_name: "Hujan di Batam",
    description:
      "Radar hujan real-time (MSS Singapura), prakiraan tinggi gelombang (BMKG OFS), dan CCTV lalu lintas Kota Batam.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#e8eaed",
    theme_color: "#e8eaed",
    lang: "id",
    categories: ["weather", "navigation"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
