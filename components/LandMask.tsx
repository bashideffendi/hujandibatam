"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.vectorgrid";
import type { ThemeMode } from "@/lib/radar";

// Field OFS (TMS tile contourf) opaque di mana-mana → bleed ke daratan. Solusi sama
// kayak app OFS BMKG: gambar polygon DARATAN (vector-tile circlegeo) di pane DI ATAS
// field, fill DICOCOKIN PERSIS warna land basemap CARTO (di-sampel: Positron #fafaf8,
// Dark Matter #262626) → darat nyatu sama basemap & nol-tint, laut tetap field.
const LAND_FILL: Record<ThemeMode, string> = { light: "#fafaf8", dark: "#262626" };

type VG = { vectorGrid: { protobuf: (url: string, opts: object) => L.Layer } };

export default function LandMask({ theme }: { theme: ThemeMode }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane("landmask")) {
      map.createPane("landmask");
      const pane = map.getPane("landmask");
      if (pane) {
        pane.style.zIndex = "260"; // di ATAS field OFS (tilePane 200), di bawah label (270)
        pane.style.pointerEvents = "none";
      }
    }
    const layer = (L as unknown as VG).vectorGrid.protobuf(
      "https://tiles.circlegeo.com/data/indocg/{z}/{x}/{y}.pbf",
      {
        pane: "landmask",
        interactive: false,
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
      },
    );
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, theme]);
  return null;
}
