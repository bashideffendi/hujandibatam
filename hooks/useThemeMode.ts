"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PREF, writePref } from "@/lib/prefs";
import { timeBasedTheme, type ThemeMode } from "@/lib/radar";

const THEME_COLOR: Record<ThemeMode, string> = { light: "#e8eaed", dark: "#0c0d10" };

/**
 * Tema app: otomatis ikut jam WIB (06–18 terang) sampai pengguna memilih manual.
 * Flip otomatis DITUNDA saat `isBusy()` (animasi jalan / kamera terbuka), karena ganti
 * tema membongkar basemap + mask + label sekaligus.
 */
export function useThemeMode(initial: ThemeMode, initialOverride: ThemeMode | null, isBusy: () => boolean) {
  const [theme, setTheme] = useState<ThemeMode>(initial);
  const override = useRef<ThemeMode | null>(initialOverride);
  const busy = useRef(isBusy);
  useEffect(() => {
    busy.current = isBusy;
  });

  useEffect(() => {
    const t = setInterval(() => {
      if (override.current || busy.current()) return;
      const next = timeBasedTheme();
      setTheme((cur) => (cur === next ? cur : next));
    }, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Tema → <html data-theme> (body/placeholder ikut) + <meta theme-color> (bar status/browser).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = THEME_COLOR[theme];
  }, [theme]);

  const toggle = useCallback(() => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    override.current = next;
    writePref(PREF.theme, next);
    setTheme(next);
  }, [theme]);

  return { theme, toggle };
}
