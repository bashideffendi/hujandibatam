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
