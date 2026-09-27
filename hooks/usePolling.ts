"use client";

import { useEffect, useRef } from "react";

/**
 * Polling yang DIGERBANG: jalan hanya saat `enabled`, langsung menembak sekali begitu
 * aktif (data lama tidak dipakai menunggu interval), dan melewati tick saat tab/PWA
 * tersembunyi.
 */
export function usePolling(fn: () => void, ms: number, enabled: boolean) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    ref.current();
    const t = setInterval(() => {
      if (!document.hidden) ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [enabled, ms]);
}

/**
 * App kembali terlihat (balik ke tab / reopen PWA / restore bfcache) atau sinyal kembali.
 * `reopen` = true hanya untuk restore bfcache — saat itu posisi timeline boleh diluruskan
 * lagi ke "sekarang"; pindah tab biasa menghormati posisi yang dipilih pengguna.
 */
export function useRevisit(cb: (reopen: boolean) => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    const run = (reopen: boolean) => {
      if (document.visibilityState === "visible") ref.current(reopen);
    };
    const onVis = () => run(false);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) run(true);
    };
    const onOnline = () => run(false);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
