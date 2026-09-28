"use client";

import type { FeatureCollection } from "geojson";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, Marker, Pane, useMap, useMapEvents } from "react-leaflet";
import type { ThemeMode } from "@/lib/radar";
import type { EchoLevel } from "@/lib/status";

// Batas 12 kecamatan Kota Batam (Satu Data Kota Batam, disederhanakan ±33 m oleh
// scripts/build-kecamatan.mjs) di atas radar. Kecamatan yang sedang hujan ditandai dengan
// DUA hal yang terbaca tanpa legenda: arsiran tipis warna kelas hujannya (di BAWAH radar,
// jadi warna radar tetap asli) + label bertulisan "Galang · Hujan Ringan". Garis batas semua
// kecamatan sama tipisnya. Nama kecamatan lain baru muncul di zoom ≥11 supaya HP tak penuh
// label. Geometri (±60 KB) dimuat terpisah, hanya saat mode Hujan dibuka.

type KecFeature = {
  type: "Feature";
  properties: { name: string; label: [number, number] | null; areaKm2: number };
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
};
type KecGeo = { type: "FeatureCollection"; features: KecFeature[] };

let geoPromise: Promise<KecGeo> | null = null;
const loadGeo = () =>
  (geoPromise ??= import("@/lib/kecamatan-geo.json")
    .then((m) => m.default as unknown as KecGeo)
    .catch((e) => {
      geoPromise = null;
      throw e;
    }));

const LINES_MIN_ZOOM = 9; // view "Luas" (z8) terlalu jauh: garisnya cuma jadi coretan
const LABELS_ALL_ZOOM = 11;
/** di zoom kecil label hujan cukup nama (kelasnya ada di panel) supaya tak saling tumpuk */
const FULL_PILL_ZOOM = 11;

// Warna garis per tema. SVG tak bisa membaca var() CSS di atribut stroke, jadi ditulis di sini.
const LINE: Record<ThemeMode, string> = {
  light: "rgba(21, 23, 28, 0.42)",
  dark: "rgba(255, 255, 255, 0.36)",
};
// Arsiran kecamatan hujan = warna titik kelas (sama dengan --dot-* di globals.css).
const FILL: Record<EchoLevel, string> = { ringan: "#00babf", sedang: "#ffa500", lebat: "#e50000" };
const LEVEL_WORD: Record<EchoLevel, string> = { ringan: "Hujan Ringan", sedang: "Hujan Sedang", lebat: "Hujan Lebat" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function labelIcon(name: string, level: EchoLevel | undefined, full: boolean) {
  const html = level
    ? `<span class="kec-pill" data-level="${level}"><i class="kec-dot" data-level="${level}"></i><b>${esc(name)}</b>${
        full ? `<span>${LEVEL_WORD[level]}</span>` : ""
      }</span>`
    : `<span class="kec-label">${esc(name)}</span>`;
  return L.divIcon({ className: "kec-label-icon", html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

type Props = {
  /** kecamatan yang sedang hujan → kelasnya */
  rainy: ReadonlyMap<string, EchoLevel>;
  /** tandai kecamatan hujan (hanya saat peta menampilkan citra terbaru) */
  showRain: boolean;
  theme: ThemeMode;
};

export default function KecamatanLayer({ rainy, showRain, theme }: Props) {
  const map = useMap();
  const [geo, setGeo] = useState<KecGeo | null>(null);
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  useEffect(() => {
    let alive = true;
    loadGeo()
      .then((g) => alive && setGeo(g))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // kunci stabil: Map baru tiap render induk tak boleh membuat ulang layer
  const rainKey = showRain ? [...rainy.entries()].map(([k, v]) => `${k}:${v}`).sort().join("|") : "";
  const rainLevels = useMemo(
    () => new Map(rainKey ? rainKey.split("|").map((e) => e.split(":") as [string, EchoLevel]) : []),
    [rainKey],
  );
  const rainGeo = useMemo<KecGeo | null>(() => {
    if (!geo || !rainLevels.size) return null;
    return { ...geo, features: geo.features.filter((f) => rainLevels.has(f.properties.name)) };
  }, [geo, rainLevels]);

  if (!geo || zoom < LINES_MIN_ZOOM) return null;
  const labels = geo.features.filter(
    (f) => f.properties.label && (zoom >= LABELS_ALL_ZOOM || rainLevels.has(f.properties.name)),
  );
  const full = zoom >= FULL_PILL_ZOOM;

  return (
    <>
      {/* arsiran di BAWAH radar (overlayPane z400) → warna radar tidak tertutup */}
      {rainGeo && (
        <Pane name="kec-fill" style={{ zIndex: 350, pointerEvents: "none" }}>
          <GeoJSON
            key={`fill-${theme}-${rainKey}`}
            data={rainGeo as unknown as FeatureCollection}
            interactive={false}
            style={(f) => ({
              stroke: false,
              fill: true,
              fillColor: FILL[rainLevels.get((f?.properties as { name: string }).name) ?? "ringan"],
              fillOpacity: theme === "dark" ? 0.26 : 0.2,
            })}
          />
        </Pane>
      )}
      <Pane name="kec-lines" style={{ zIndex: 420, pointerEvents: "none" }}>
        <GeoJSON
          key={`base-${theme}`}
          data={geo as unknown as FeatureCollection}
          interactive={false}
          style={{ color: LINE[theme], weight: 1, fill: false, lineJoin: "round" }}
        />
      </Pane>
      <Pane name="kec-labels" style={{ zIndex: 430, pointerEvents: "none" }}>
        {labels.map((f) => {
          const level = rainLevels.get(f.properties.name);
          return (
            <Marker
              key={`${f.properties.name}-${level ?? "-"}-${full ? 1 : 0}`}
              position={f.properties.label as [number, number]}
              icon={labelIcon(f.properties.name, level, full)}
              interactive={false}
              keyboard={false}
            />
          );
        })}
      </Pane>
    </>
  );
}
