import type { Metadata, Viewport } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const DESC =
  "Radar hujan real-time untuk Batam & sekitarnya. Sumber data: Meteorological Service Singapore (jangkauan 240 km), update tiap 5 menit.";

export const metadata: Metadata = {
  metadataBase: new URL("https://hujandibatam.masbash.id"),
  applicationName: "Hujan di Batam",
  title: "Hujan di Batam — Radar Hujan Real-time",
  description: DESC,
  appleWebApp: {
    capable: true,
    title: "Hujan di Batam",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "https://hujandibatam.masbash.id",
    siteName: "Hujan di Batam",
    title: "Hujan di Batam — Radar Hujan Real-time",
    description: DESC,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Hujan di Batam — radar hujan real-time",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hujan di Batam — Radar Hujan Real-time",
    description: DESC,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8eaed" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d10" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
