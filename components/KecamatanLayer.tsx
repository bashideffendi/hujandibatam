"use client";

import type { FeatureCollection } from "geojson";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, Marker, Pane, useMap, useMapEvents } from "react-leaflet";
import type { ThemeMode } from "@/lib/radar";
import type { EchoLevel } from "@/lib/status";

// Batas 12 kecamatan Kota Batam (Satu Data Kota Batam, disederhanakan ±33 m oleh
// scripts/build-kecamatan.mjs) di atas radar. Kecamatan yang sedang hujan digaris tebal dan
// namanya selalu tampil; nama kecamatan lain baru muncul di zoom ≥11 supaya HP tak penuh label.
// Geometri (±60 KB) dimuat terpisah, hanya saat mode Hujan dibuka.

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

// Warna garis per tema. SVG tak bisa membaca var() CSS di atribut stroke, jadi ditulis di sini.
const LINE: Record<ThemeMode, { base: string; rain: string }> = {
  light: { base: "rgba(21, 23, 28, 0.42)", rain: "rgba(21, 23, 28, 0.9)" },
  dark: { base: "rgba(255, 255, 255, 0.36)", rain: "rgba(255, 255, 255, 0.92)" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function labelIcon(name: string, level: EchoLevel | undefined) {
  const dot = level ? `<i class="kec-dot" data-level="${level}"></i>` : "";
  return L.divIcon({
    className: "kec-label-icon",
    html: `<span class="kec-label${level ? " is-rain" : ""}">${dot}${esc(name)}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

type Props = {
  /** kecamatan yang sedang hujan → kelasnya */
  rainy: ReadonlyMap<string, EchoLevel>;
  /** sorot kecamatan hujan (hanya saat peta menampilkan citra terbaru) */
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
  const rainGeo = useMemo<KecGeo | null>(() => {
    if (!geo || !rainKey) return null;
    const names = new Set(rainKey.split("|").map((e) => e.split(":")[0]));
    return { ...geo, features: geo.features.filter((f) => names.has(f.properties.name)) };
  }, [geo, rainKey]);

  if (!geo || zoom < LINES_MIN_ZOOM) return null;
  const color = LINE[theme];
  const labels = geo.features.filter(
    (f) => f.properties.label && (zoom >= LABELS_ALL_ZOOM || (showRain && rainy.has(f.properties.name))),
  );

  return (
    <>
      <Pane name="kec-lines" style={{ zIndex: 420, pointerEvents: "none" }}>
        <GeoJSON
          key={`base-${theme}`}
          data={geo as unknown as FeatureCollection}
          interactive={false}
          style={{ color: color.base, weight: 1, fill: false, lineJoin: "round" }}
        />
        {rainGeo && rainGeo.features.length > 0 && (
          <GeoJSON
            key={`rain-${theme}-${rainKey}`}
            data={rainGeo as unknown as FeatureCollection}
            interactive={false}
            style={{ color: color.rain, weight: 2, fill: false, lineJoin: "round" }}
          />
        )}
      </Pane>
      <Pane name="kec-labels" style={{ zIndex: 430, pointerEvents: "none" }}>
        {labels.map((f) => {
          const level = showRain ? rainy.get(f.properties.name) : undefined;
          return (
            <Marker
              key={`${f.properties.name}-${level ?? "-"}`}
              position={f.properties.label as [number, number]}
              icon={labelIcon(f.properties.name, level)}
              interactive={false}
              keyboard={false}
            />
          );
        })}
      </Pane>
    </>
  );
}
