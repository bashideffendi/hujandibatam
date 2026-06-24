"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type {
  GeoJSON as LGeoJSON,
  Layer,
  LeafletMouseEvent,
  Path,
  PathOptions,
} from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  normCat,
  WAVE_BORDER,
  WAVE_FILL,
  WAVE_FILL_FALLBACK,
  type ThemeMode,
} from "@/lib/radar";

type WaveProps = { c: string; n: string };
type Areas = Record<string, Record<string, string>>;

type Props = {
  areas: Areas | null;
  periodKey: string;
  opacity: number;
  theme: ThemeMode;
  onPick: (code: string) => Promise<string>; // fetch detail → HTML popup
};

// Choropleth gelombang: geometri statis (fetch sekali), warna ikut kategori per periode.
// Recolor pakai setStyle (NOL re-parse geometri) — bukan remount per scrub.
export default function WaveLayer({ areas, periodKey, opacity, theme, onPick }: Props) {
  const [data, setData] = useState<FeatureCollection<Geometry, WaveProps> | null>(null);
  const geoRef = useRef<LGeoJSON | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/data/perairan-batam.json")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const styleFor = useCallback(
    (feature?: Feature<Geometry, WaveProps>): PathOptions => {
      const code = feature?.properties?.c ?? "";
      const cat = normCat(areas?.[code]?.[periodKey] ?? "");
      const fill = (cat && WAVE_FILL[theme][cat]) || WAVE_FILL_FALLBACK;
      return {
        fillColor: fill,
        fillOpacity: opacity,
        color: WAVE_BORDER[theme],
        weight: 1,
        className: "wave-area",
      };
    },
    [areas, periodKey, opacity, theme],
  );

  // Ref ke styleFor TERKINI — dipakai popupclose biar reset highlight balik ke warna
  // periode/tema SEKARANG, bukan ke style mount-time (resetStyle Leaflet bikin basi/abu).
  const styleForRef = useRef(styleFor);
  styleForRef.current = styleFor;

  // Recolor saat periode/tema/opacity/kategori berubah — repaint path, tanpa remount.
  useEffect(() => {
    geoRef.current?.setStyle(styleFor);
  }, [styleFor]);

  if (!data) return null;
  return (
    <GeoJSON
      ref={geoRef}
      data={data}
      style={styleFor}
      onEachFeature={(feature: Feature<Geometry, WaveProps>, layer: Layer) => {
        const code = feature.properties?.c;
        const name = feature.properties?.n ?? "";
        if (!code) return;
        layer.on("click", async (e: LeafletMouseEvent) => {
          layer.bindPopup(
            `<div class="wave-pop"><div class="wp-area">${name}</div><div class="wp-row">Memuat…</div></div>`,
            { className: "wave-popup", maxWidth: 270, closeButton: true, autoPan: true },
          );
          layer.openPopup(e.latlng);
          const html = await onPick(code);
          if (layer.getPopup()) layer.setPopupContent(html);
        });
        layer.on("popupopen", () => (layer as Path).setStyle({ weight: 2.4 }));
        layer.on("popupclose", () => (layer as Path).setStyle(styleForRef.current(feature)));
      }}
    />
  );
}
