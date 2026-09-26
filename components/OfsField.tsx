"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { OFS_TILE } from "@/lib/radar";

// Field gelombang OFS (TMS tile contourf BMKG) dengan DOUBLE-BUFFER:
// react-leaflet <TileLayer url=…> memanggil setUrl() tiap frame, dan Leaflet 1.9
// membuang SEMUA tile lama sebelum satu pun tile baru datang → laut berkedip kosong
// tiap langkah timeline. Di sini tiap frame jadi layer BARU di atas layer lama;
// layer lama baru dilepas setelah layer baru selesai memuat (event `load`).
//
// Sekalian mendeteksi tile ditolak (Cloudflare 403/HTML): ≥3 tileerror tanpa satu
// pun tileload → onTilesDown(true) → panel bisa jujur "tile gagal dimuat".
type Props = {
  baserun: string;
  valid: string;
  opacity: number;
  onTilesDown?: (down: boolean) => void;
};

const SAFETY_MS = 4000;

export default function OfsField({ baserun, valid, opacity, onTilesDown }: Props) {
  const map = useMap();
  const layersRef = useRef<L.TileLayer[]>([]);
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;
  const onDownRef = useRef(onTilesDown);
  onDownRef.current = onTilesDown;

  useEffect(() => {
    const layer = L.tileLayer(OFS_TILE(baserun, valid), {
      tms: true,
      opacity: opacityRef.current,
      zIndex: 250,
      maxNativeZoom: 8,
      maxZoom: 20,
      attribution: "Gelombang: BMKG OFS",
    });
    let errors = 0;
    let loads = 0;
    let settled = false;
    const dropOld = () => {
      if (settled) return;
      settled = true;
      for (const old of layersRef.current) if (old !== layer) map.removeLayer(old);
      layersRef.current = [layer];
    };
    layer.on("tileerror", () => {
      errors++;
      if (errors >= 3 && loads === 0) onDownRef.current?.(true);
    });
    layer.on("tileload", () => {
      loads++;
      if (loads === 1) onDownRef.current?.(false);
    });
    layer.on("load", dropOld);
    layer.addTo(map);
    layersRef.current.push(layer);
    // Kalau `load` nggak pernah datang (semua tile error), jangan biarkan layer menumpuk.
    const t = window.setTimeout(dropOld, SAFETY_MS);
    return () => {
      window.clearTimeout(t);
    };
  }, [map, baserun, valid]);

  // Unmount (keluar mode OMBAK) → lepas semua layer.
  useEffect(
    () => () => {
      for (const l of layersRef.current) map.removeLayer(l);
      layersRef.current = [];
    },
    [map],
  );

  useEffect(() => {
    for (const l of layersRef.current) l.setOpacity(opacity);
  }, [opacity]);

  return null;
}
