import type { NextConfig } from "next";

// Radar PNG di-overlay langsung lewat <img> (Leaflet ImageOverlay), bukan next/image,
// jadi nggak perlu remotePatterns. Build dibiarkan strict.
//
// Header keamanan (defense-in-depth, app ini tanpa auth/form):
//  - Referrer-Policy strict-origin-when-cross-origin: origin tetap terkirim ke CARTO
//    (restriksi key mereka berbasis Referer), path nggak bocor ke pihak ketiga.
//  - frame-ancestors 'none' + X-Frame-Options: situs lain nggak bisa nge-iframe app ini
//    (kalau bisa, Referer iframe = domain kita → mereka numpang kuota tile CARTO).
//  - nosniff, Permissions-Policy, HSTS (custom domain Vercel nggak otomatis kirim HSTS).
//  - /sw.js no-cache: update service worker kepasang begitu deploy.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Cache build Turbopack (bawaan Next 16.3) DIMATIKAN: Vercel memulihkannya dari deploy
  // sebelumnya, dan deploy 006ab42 (29 Sep 2026) keluar dengan CSS basi — JS baru, tapi
  // chunk CSS bernama sama dengan deploy lama (aturan globals.css baru hilang di produksi).
  // Build bersih ±beberapa detik lebih lama; hasilnya selalu sesuai kode.
  experimental: {
    turbopackFileSystemCacheForBuild: false,
  },
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
