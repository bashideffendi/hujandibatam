"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OfsResponse, PerairanResponse } from "@/lib/api-types";
import { isAbort } from "@/lib/client";
import { useAbortableFetch } from "./useAbortableFetch";
import { usePolling } from "./usePolling";
import { useResource } from "./useResource";

const REFRESH_MS = 2 * 60 * 1000;
const PERAIRAN_MS = 30 * 60 * 1000; // prakiraan teks BMKG terbit 2x sehari
const OFS_PLAY_MS = 1100; // animasi timeline gelombang lebih pelan dari radar

/**
 * Pipeline OMBAK: run & frame OFS BMKG, posisi timeline (terpisah dari radar supaya balik
 * mode posisi masing-masing tetap), status tile/mask, dan prakiraan teks perairan Batam.
 */
export function useOfs({
  enabled,
  playing,
  onSweepEnd,
}: {
  enabled: boolean;
  playing: boolean;
  onSweepEnd: () => void;
}) {
  const [ofs, setOfs] = useState<OfsResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const [tilesDown, setTilesDown] = useState(false);
  const [maskOk, setMaskOk] = useState<boolean | null>(null);

  const ofsRef = useRef<OfsResponse | null>(null);
  const idxRef = useRef(0);
  const manualRef = useRef(false); // pengguna memilih posisi sendiri → refetch jangan menarik balik
  const endRef = useRef(onSweepEnd);
  useEffect(() => {
    idxRef.current = idx;
    endRef.current = onSweepEnd;
  });

  const fetchJson = useAbortableFetch();
  const load = useCallback(
    async (resetIdx: boolean) => {
      try {
        const d = await fetchJson<OfsResponse>("/api/ofs-frame");
        ofsRef.current = d;
        setOfs(d);
        setFailed(false);
        // Buka di frame yang paling dekat jam sekarang, KECUALI pengguna sedang memilih posisi
        // sendiri (supaya reopen PWA sesudah lewat waktu tidak nyangkut di frame lama).
        if ((resetIdx || !manualRef.current) && d.frames?.length) {
          setIdx(Math.max(0, Math.min(d.frames.length - 1, d.nowIndex)));
        }
      } catch (e) {
        if (isAbort(e)) return;
        setFailed(true); // → panel bilang "gangguan" + Coba lagi (bukan "Memuat…" selamanya)
      }
    },
    [fetchJson],
  );

  // Masuk mode → fetch segera. Pertama kali (atau selama belum pernah berhasil) lurus ke "sekarang".
  usePolling(() => load(!ofsRef.current), REFRESH_MS, enabled);

  // Keluar mode → posisi manual dilupakan, jadi kunjungan berikutnya mulai dari "sekarang".
  useEffect(() => {
    if (!enabled) manualRef.current = false;
  }, [enabled]);

  const perairan = useResource<PerairanResponse>("/api/perairan", PERAIRAN_MS, enabled, true);

  // Sweep timeline prakiraan SEKALI lalu berhenti (tile dimuat tiap langkah — jangan berputar).
  const count = ofs?.frames.length ?? 0;
  useEffect(() => {
    if (!playing || !enabled || count < 2) return;
    manualRef.current = true;
    const t = setInterval(() => {
      if (idxRef.current >= count - 1) {
        endRef.current();
        return;
      }
      setIdx(idxRef.current + 1);
    }, OFS_PLAY_MS);
    return () => clearInterval(t);
  }, [playing, enabled, count]);

  const scrub = useCallback((v: number) => {
    manualRef.current = true;
    setIdx(v);
  }, []);

  /** Reopen (restore bfcache): luruskan lagi ke "sekarang". */
  const reopen = useCallback(() => {
    manualRef.current = false;
    load(true);
  }, [load]);

  /** Tekan Putar saat mentok di ujung → mulai lagi dari frame "sekarang". */
  const rewindIfAtEnd = useCallback(() => {
    const o = ofsRef.current;
    if (o && idxRef.current >= o.frames.length - 1) setIdx(o.nowIndex);
  }, []);

  return {
    ofs,
    idx,
    failed,
    tilesDown,
    maskOk,
    perairan: perairan.data,
    load,
    reopen,
    scrub,
    rewindIfAtEnd,
    setTilesDown,
    setMaskOk,
  };
}
