"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Jam berjalan (ms epoch) yang di-update tiap `ms` — buat label "X mnt lalu". */
/** true selama media query cocok (mis. layar lebar ≥900 px → panel jadi sidebar). */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const apply = () => setOn(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return on;
}

export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** true saat browser melaporkan offline. */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return offline;
}

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/** Tangkap prompt install PWA (Chrome/Android) → tombol "Pasang" manual. iOS tidak punya ini. */
export function useInstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const install = useCallback(async () => {
    if (!evt) return;
    try {
      await evt.prompt();
      await evt.userChoice;
    } catch {
      /* abaikan */
    }
    setEvt(null);
  }, [evt]);
  return { canInstall: !!evt, install };
}

export type SharePayload = { title: string; text: string; url: string };

/**
 * Bagikan lewat menu bawaan perangkat (Web Share API). Kalau tidak ada (kebanyakan
 * desktop), salin tautannya ke clipboard dan tampilkan konfirmasi singkat.
 */
export function useShare() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const show = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const share = useCallback(
    async (p: SharePayload) => {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share(p);
          return;
        } catch (e) {
          if ((e as Error)?.name === "AbortError") return; // pengguna membatalkan — bukan kegagalan
        }
      }
      try {
        await navigator.clipboard.writeText(p.url);
        show("Tautan Disalin");
      } catch {
        show("Belum Bisa Menyalin, Salin dari Bilah Alamat");
      }
    },
    [show],
  );
  return { share, toast };
}
