"use client";

import dynamic from "next/dynamic";

// Leaflet butuh `window`, jadi map-nya client-only (nggak di-SSR). Placeholder-nya
// ikut tema (html[data-theme] di-set skrip inline di layout SEBELUM paint) — jadi
// siang hari nggak ada kedipan gelap → terang.
const RadarMap = dynamic(() => import("./RadarMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Memuat Peta…</div>,
});

export default function MapShell() {
  return <RadarMap />;
}
