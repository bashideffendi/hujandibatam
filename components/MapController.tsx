"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { reduceMotion } from "@/lib/client";
import {
  CCTV_MAX_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  OMBAK_MIN_ZOOM,
  VIEWS,
  type Mode,
  type ViewKey,
} from "@/lib/radar";

export type Padding = { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] };

// Batas zoom per mode + fit peta ke bounding box view, dengan padding dinamis sesuai
// tinggi panel/topbar asli. Fit ulang saat rotasi layar — bukan tiap resize kecil.
export default function MapController({
  view,
  mode,
  getPadding,
  collapsed,
}: {
  view: ViewKey;
  mode: Mode;
  getPadding: () => Padding;
  collapsed: boolean;
}) {
  const map = useMap();
  const mounted = useRef(false);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  const fit = useCallback(
    (v: ViewKey, animate: boolean, duration = 0.8) => {
      const b = VIEWS[v].bounds;
      const opts = getPadding();
      if (!animate || reduceMotion()) map.fitBounds(b, { ...opts, animate: false });
      else map.flyToBounds(b, { ...opts, duration });
    },
    [map, getPadding],
  );

  // SATU effect untuk [mode, view]: batas zoom ditulis langsung ke options (setMinZoom/
  // setMaxZoom Leaflet memicu setZoom BERANIMASI yang berebut sama flyToBounds), lalu fit.
  //  - OMBAK: zoom-out lebih jauh (gak ada radar yg pecah) biar laut jauh keliatan;
  //  - CCTV: zoom-in lebih dalam biar pin berdempet bisa dipisah & diklik;
  //  - ganti mode TANPA ganti view tetap reframe (tinggi panel beda per mode).
  useEffect(() => {
    const min = mode === "ombak" ? OMBAK_MIN_ZOOM : MIN_ZOOM;
    const max = mode === "cctv" ? CCTV_MAX_ZOOM : MAX_ZOOM;
    map.options.minZoom = min;
    map.options.maxZoom = max;
    map.fire("zoomlevelschange");
    if (!mounted.current) {
      mounted.current = true;
      map.invalidateSize();
      fit(view, false);
      return;
    }
    const z = map.getZoom();
    if (z < min || z > max) map.setZoom(Math.min(max, Math.max(min, z)), { animate: false });
    fit(view, true);
  }, [mode, view, map, fit]);

  // panel ditutup/dibuka -> tinggi panel berubah -> re-frame halus pakai ruang baru
  const firstCollapse = useRef(true);
  useEffect(() => {
    if (firstCollapse.current) {
      firstCollapse.current = false;
      return;
    }
    fit(viewRef.current, true, 0.4);
  }, [collapsed, fit]);

  // resize: invalidateSize selalu (debounce), tapi fit ulang HANYA kalau lebar berubah
  // banyak (rotasi/split-screen) — toolbar browser muncul/hilang atau keluar fullscreen
  // video CCTV jangan sampai membuang pan/zoom pengguna.
  useEffect(() => {
    let lastW = window.innerWidth;
    let t: number | null = null;
    const onResize = () => {
      if (t !== null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        map.invalidateSize();
        const w = window.innerWidth;
        if (Math.abs(w - lastW) > 80) {
          lastW = w;
          fit(viewRef.current, false);
        }
      }, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (t !== null) window.clearTimeout(t);
    };
  }, [map, fit]);

  return null;
}
