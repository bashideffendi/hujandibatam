"use client";

import type { FeatureCollection } from "geojson";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, Marker, Pane, useMap, useMapEvents } from "react-leaflet";
import { KOTA_UTAMA, levelRank } from "@/lib/kecamatan";
import { PLACES, type ThemeMode } from "@/lib/radar";
import type { EchoLevel } from "@/lib/status";

// Batas 52 kecamatan di Batam, Tanjungpinang, Bintan, Karimun, dan Lingga (Badan Informasi
// Geospasial edisi Juni 2026, disederhanakan oleh scripts/build-kecamatan.mjs) di atas radar. Kecamatan yang sedang hujan ditandai dengan
// DUA hal yang terbaca tanpa legenda: arsiran tipis warna kelas hujannya (di BAWAH radar,
// jadi warna radar tetap asli) + label bertulisan "Galang · Hujan Ringan". Garis batas semua
// kecamatan sama tipisnya. Nama kecamatan lain baru muncul di zoom ≥11 supaya HP tak penuh
// label; label yang saling tabrak disaring (lihat `layout`). Geometri (±390 KB) dimuat
// terpisah, hanya saat mode Hujan dibuka.

type KecFeature = {
  type: "Feature";
  properties: { code: string; name: string; kab: string; label: [number, number] | null; areaKm2: number };
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

/** arsiran & label kecamatan hujan: view "Kepri" di HP kecil jatuh ke z7, jadi tetap tampil */
const RAIN_MIN_ZOOM = 7;
/** garis batas semua kecamatan: di z7 ("Luas") cuma jadi coretan */
const LINES_MIN_ZOOM = 8;
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
/** titik kelas saja: kecamatan hujan yang labelnya tak muat (bertabrakan dengan label lain) */
const dotIcon = (level: EchoLevel) =>
  L.divIcon({
    className: "kec-label-icon",
    html: `<i class="kec-dot kec-dot-solo" data-level="${level}"></i>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

// Ukuran label di layar untuk cek tabrakan (padanan CSS .kec-pill / .kec-label di globals.css).
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(s: string, font: string): number {
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
}
function labelSize(name: string, level: EchoLevel | undefined, full: boolean, family: string): [number, number] {
  if (!level) return [textWidth(name, `600 10.5px ${family}`) + name.length * 0.21, 14];
  // padding 8+10, titik 7, jarak 6, bingkai 2
  const w =
    33 + textWidth(name, `700 12px ${family}`) + (full ? 6 + textWidth(LEVEL_WORD[level], `500 12px ${family}`) : 0);
  return [w, 28];
}
const LABEL_GAP = 4;

type Props = {
  /** kode kecamatan yang sedang hujan → kelasnya */
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
  // (urutan dari rainyMap = terderas & terluas dulu → dipakai sebagai prioritas label)
  const rainKey = showRain ? [...rainy.entries()].map(([k, v]) => `${k}:${v}`).join("|") : "";
  const rainLevels = useMemo(
    () => new Map(rainKey ? rainKey.split("|").map((e) => e.split(":") as [string, EchoLevel]) : []),
    [rainKey],
  );
  const rainGeo = useMemo<KecGeo | null>(() => {
    if (!geo || !rainLevels.size) return null;
    return { ...geo, features: geo.features.filter((f) => rainLevels.has(f.properties.code)) };
  }, [geo, rainLevels]);

  const full = zoom >= FULL_PILL_ZOOM;
  // Tata letak label: yang terderas (lalu Kota Batam, lalu yang terluas hujannya) dapat tempat
  // lebih dulu; label yang menabrak label terpasang tidak digambar. Kecamatan hujan yang
  // labelnya tersisih tetap ditandai titik kelas + arsiran, dan namanya ada di panel. Posisi
  // relatif di layar hanya bergantung zoom, jadi cukup dihitung ulang saat zoom berubah.
  const layout = useMemo(() => {
    const pills: KecFeature[] = [];
    const dots: KecFeature[] = [];
    if (!geo || zoom < RAIN_MIN_ZOOM) return { pills, dots };
    const order = [...rainLevels.keys()];
    const cands = geo.features
      .filter((f) => f.properties.label && (zoom >= LABELS_ALL_ZOOM || rainLevels.has(f.properties.code)))
      .map((f) => ({ f, level: rainLevels.get(f.properties.code) }))
      .sort(
        (a, b) =>
          levelRank(b.level ?? null) - levelRank(a.level ?? null) ||
          Number(b.f.properties.kab === KOTA_UTAMA) - Number(a.f.properties.kab === KOTA_UTAMA) ||
          (a.level ? order.indexOf(a.f.properties.code) - order.indexOf(b.f.properties.code) : 0) ||
          b.f.properties.areaKm2 - a.f.properties.areaKm2,
      );
    const family = getComputedStyle(map.getContainer()).fontFamily;
    // label kota (PLACES di RadarMap: titik + tooltip kanan, .place-label 10.5px/600, jarak
    // 6 px offset + 6 px margin Leaflet) sudah terpasang lebih dulu → ruangnya dipesan
    const boxes: [number, number, number, number][] = PLACES.map((pl) => {
      const p = map.project([pl.lat, pl.lng], zoom);
      const w = textWidth(pl.name, `600 10.5px ${family}`) + pl.name.length * 0.42;
      return [p.x - 4, p.y - 9, p.x + 14 + w, p.y + 9];
    });
    for (const { f, level } of cands) {
      const p = map.project(f.properties.label as [number, number], zoom);
      const [w, h] = labelSize(f.properties.name, level, full, family);
      const box: [number, number, number, number] = [
        p.x - w / 2 - LABEL_GAP,
        p.y - h / 2 - LABEL_GAP,
        p.x + w / 2 + LABEL_GAP,
        p.y + h / 2 + LABEL_GAP,
      ];
      const hits = (q: number[]) => boxes.some((b) => q[0] < b[2] && q[2] > b[0] && q[1] < b[3] && q[3] > b[1]);
      if (!hits(box)) {
        boxes.push(box);
        pills.push(f);
      } else if (level) {
        // titik kelas hanya kalau tak jatuh di atas label terpasang (kalau jatuh, arsirannya
        // tetap menandai); ruangnya dipesan supaya label berikutnya tak menutupinya
        const dot: [number, number, number, number] = [p.x - 7, p.y - 7, p.x + 7, p.y + 7];
        if (!hits(dot)) {
          boxes.push(dot);
          dots.push(f);
        }
      }
    }
    return { pills, dots };
  }, [geo, zoom, rainLevels, full, map]);

  if (!geo || zoom < RAIN_MIN_ZOOM) return null;

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
              fillColor: FILL[rainLevels.get((f?.properties as { code: string }).code) ?? "ringan"],
              fillOpacity: theme === "dark" ? 0.26 : 0.2,
            })}
          />
        </Pane>
      )}
      {zoom >= LINES_MIN_ZOOM && (
        <Pane name="kec-lines" style={{ zIndex: 420, pointerEvents: "none" }}>
          <GeoJSON
            key={`base-${theme}`}
            data={geo as unknown as FeatureCollection}
            interactive={false}
            style={{ color: LINE[theme], weight: 1, fill: false, lineJoin: "round" }}
          />
        </Pane>
      )}
      <Pane name="kec-labels" style={{ zIndex: 430, pointerEvents: "none" }}>
        {layout.dots.map((f) => {
          const level = rainLevels.get(f.properties.code) as EchoLevel;
          return (
            <Marker
              key={`dot-${f.properties.code}-${level}`}
              position={f.properties.label as [number, number]}
              icon={dotIcon(level)}
              interactive={false}
              keyboard={false}
              zIndexOffset={2000}
            />
          );
        })}
        {layout.pills.map((f) => {
          const level = rainLevels.get(f.properties.code);
          return (
            <Marker
              key={`${f.properties.code}-${level ?? "-"}-${full ? 1 : 0}`}
              position={f.properties.label as [number, number]}
              icon={labelIcon(f.properties.name, level, full)}
              interactive={false}
              keyboard={false}
              zIndexOffset={level ? 1000 : 0}
            />
          );
        })}
      </Pane>
    </>
  );
}
