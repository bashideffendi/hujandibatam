"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { ThemeMode } from "@/lib/radar";
import { CIRCLEGEO_LAND, CIRCLEGEO_SENTINEL } from "@/lib/sources";

// Field OFS (TMS tile contourf) opaque di mana-mana → bleed ke daratan. Solusi sama
// kayak app OFS BMKG: gambar polygon DARATAN (vector-tile circlegeo) di pane DI ATAS
// field, fill DICOCOKIN PERSIS warna land basemap CARTO (di-sampel: Positron #fafaf8,
// Dark Matter #262626) → darat nyatu sama basemap & nol-tint, laut tetap field.
//
// leaflet.vectorgrid dimuat DINAMIS (cuma mode OMBAK yang butuh), dan karena plugin
// itu diam-diam merender tile kosong kalau server error, satu tile SENTINEL z7 (pasti
// berisi darat) di-fetch buat memastikan mask-nya beneran ada → onStatus(false) kalau
// gagal, supaya panel bisa jujur "warna di atas pulau bukan data".
const LAND_FILL: Record<ThemeMode, string> = { light: "#fafaf8", dark: "#262626" };

type VG = { vectorGrid: { protobuf: (url: string, opts: object) => L.Layer } };
type Props = { theme: ThemeMode; onStatus?: (ok: boolean) => void };

export default function LandMask({ theme, onStatus }: Props) {
  const map = useMap();
  useEffect(() => {
    let layer: L.Layer | null = null;
    let cancelled = false;
    if (!map.getPane("landmask")) {
      map.createPane("landmask");
      const pane = map.getPane("landmask");
      if (pane) {
        pane.style.zIndex = "260"; // di ATAS field OFS (tilePane 200/250), di bawah label (270)
        pane.style.pointerEvents = "none";
      }
    }
    (async () => {
      try {
        await import("leaflet.vectorgrid");
      } catch {
        onStatus?.(false);
        return;
      }
      if (cancelled) return;
      layer = (L as unknown as VG).vectorGrid.protobuf(CIRCLEGEO_LAND, {
        pane: "landmask",
        interactive: false,
        attribution: "Daratan: &copy; OpenStreetMap (via CircleGeo)",
        maxNativeZoom: 10,
        minZoom: 0,
        maxZoom: 20,
        vectorTileLayerStyles: {
          indocg: {
            fill: true,
            fillColor: LAND_FILL[theme],
            fillOpacity: 1,
            stroke: false,
            weight: 0,
          },
        },
      });
      layer.addTo(map);
      try {
        const r = await fetch(CIRCLEGEO_SENTINEL, { signal: AbortSignal.timeout(5000) });
        const buf = r.ok ? await r.arrayBuffer() : null;
        if (!cancelled) onStatus?.(!!buf && buf.byteLength > 50);
      } catch {
        if (!cancelled) onStatus?.(false);
      }
    })();
    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, theme, onStatus]);
  return null;
}
