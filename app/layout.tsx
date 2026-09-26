import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { CARTO_PRECONNECT, MSS_HOST, SITE_URL } from "@/lib/sources";

// Font di-self-host lewat next/font: nggak ada request ke Google dari browser pengguna,
// nggak ada CSS lintas-origin yang render-blocking, dan wordmark nggak "loncat" (FOUT).
// Fraunces cuma dipakai wordmark (weight 500, "di" italic) — jangan tambah weight lain.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-inter" });
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});

const TITLE = "Hujan di Batam — Radar Hujan, Ombak & CCTV Batam";
const DESC =
  "Radar hujan real-time Batam (MSS Singapura, update 5 menit), prakiraan tinggi gelombang BMKG, dan CCTV lalu lintas Kota Batam — dalam satu peta.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "Hujan di Batam",
  title: TITLE,
  description: DESC,
  appleWebApp: {
    capable: true,
    title: "Hujan di Batam",
    // "default" (bukan black-translucent): status bar iOS nggak menimpa topbar tema terang.
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: SITE_URL,
    siteName: "Hujan di Batam",
    title: TITLE,
    description: DESC,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Hujan di Batam — radar hujan, ombak & CCTV Batam",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  // Satu warna awal; RadarMap meng-update <meta name="theme-color"> mengikuti tema app
  // (jam WIB / pilihan manual), bukan prefers-color-scheme OS yang bisa beda.
  themeColor: "#e8eaed",
  width: "device-width",
  initialScale: 1,
  // maximumScale sengaja TIDAK dikunci — pinch-zoom halaman dibiarkan (WCAG 1.4.4).
  // cover: konten boleh masuk area notch/home-bar; CSS pakai env(safe-area-inset-*).
  viewportFit: "cover",
};

// Tema di-set ke <html> SEBELUM paint (localStorage → jam WIB) supaya body & placeholder
// peta sudah benar warnanya sejak byte pertama. Nilai yang sama dihitung ulang RadarMap.
const THEME_SCRIPT =
  '(function(){try{var s=localStorage.getItem("hujan-theme");var h=(new Date().getUTCHours()+7)%24;' +
  'var t=(s==="light"||s==="dark")?s:(h>=6&&h<18?"light":"dark");document.documentElement.dataset.theme=t;}catch(e){}})();';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${inter.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {CARTO_PRECONNECT.map((h) => (
          <link key={h} rel="preconnect" href={h} crossOrigin="" />
        ))}
        <link rel="preconnect" href={MSS_HOST} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
