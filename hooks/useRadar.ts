"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EchoSummary, FramesResponse } from "@/lib/api-types";
import { isAbort, saveData } from "@/lib/client";
import type { Frame } from "@/lib/radar";
import type { LoadStatus } from "@/lib/status";
import { useAbortableFetch } from "./useAbortableFetch";
import { usePolling } from "./usePolling";

const REFRESH_MS = 2 * 60 * 1000; // refetch tiap 2 mnt (radar terbit tiap 5 mnt)
const PLAY_MS = 650;
const PRELOAD_NOW = 6; // frame terbaru yang dipanaskan langsung; sisanya saat idle

/**
 * Pipeline radar hujan: daftar frame, posisi timeline, kesegaran, echo sekitar Batam,
 * preload PNG, dan loop animasi. Aktif hanya di mode HUJAN.
 */
export function useRadar({ enabled, playing }: { enabled: boolean; playing: boolean }) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [stale, setStale] = useState(false);
  const [echo, setEcho] = useState<EchoSummary | null>(null);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  /** ms epoch pemuatan terakhir yang berhasil — dipakai buat menyegarkan label umur. */
  const [loadedAt, setLoadedAt] = useState(0);

  const followRef = useRef(true); // ikut frame terbaru sampai pengguna menggeser manual
  const framesRef = useRef<Frame[]>([]);
  const idxRef = useRef(0);
  const brokenRef = useRef(broken);
  const playingRef = useRef(playing);
  const preloaded = useRef<Set<string>>(new Set());
  useEffect(() => {
    idxRef.current = idx;
    brokenRef.current = broken;
    playingRef.current = playing;
  });

  const fetchJson = useAbortableFetch();
  const load = useCallback(async () => {
    try {
      const data = await fetchJson<FramesResponse>("/api/frames");
      if (data.frames?.length) {
        const prevTs = framesRef.current[idxRef.current]?.ts;
        framesRef.current = data.frames;
        setFrames(data.frames);
        setStale(Boolean(data.stale));
        setEcho(data.echo ?? null);
        // Realign berdasarkan TIMESTAMP, bukan indeks: daftar bergeser 1 langkah tiap refetch,
        // jadi hasil scrub nggak diam-diam maju 5 menit. Saat Putar, biarkan loop jalan.
        if (!playingRef.current) {
          setIdx((prev) => {
            if (followRef.current) return data.frames.length - 1;
            const j = prevTs ? data.frames.findIndex((f) => f.ts === prevTs) : -1;
            return j >= 0 ? j : Math.min(prev, data.frames.length - 1);
          });
        }
        setStatus("ok");
      } else {
        // MSS nihil: pertahankan frames lama (kalau ada) tapi tandai tertunda.
        setStale(true);
        setStatus((s) => (framesRef.current.length ? s : "error"));
      }
      setLoadedAt(Date.now());
    } catch (e) {
      if (isAbort(e)) return;
      setStatus("error");
    }
  }, [fetchJson]);

  usePolling(load, REFRESH_MS, enabled);

  const markBroken = useCallback((url: string) => {
    setBroken((prev) => {
      if (prev.has(url)) return prev;
      const n = new Set(prev);
      n.add(url);
      return n;
    });
  }, []);

  // Preload PNG: hormati Data Saver, terbaru dulu, prioritas rendah. Frame 404 ditandai
  // broken supaya tidak pernah tampil sebagai "tidak hujan".
  useEffect(() => {
    if (!enabled || saveData()) return;
    const list = [...frames].reverse();
    const warm = (f: Frame) => {
      if (preloaded.current.has(f.url)) return;
      preloaded.current.add(f.url);
      const img = new window.Image();
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
      img.decoding = "async";
      img.onerror = () => {
        preloaded.current.delete(f.url);
        markBroken(f.url);
      };
      img.src = f.url;
    };
    list.slice(0, PRELOAD_NOW).forEach(warm);
    const rest = list.slice(PRELOAD_NOW);
    // requestIdleCallback belum ada di Safari lama → fallback timeout.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const handle = hasIdle
      ? window.requestIdleCallback(() => rest.forEach(warm))
      : window.setTimeout(() => rest.forEach(warm), 1500);
    return () => {
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [frames, enabled, markBroken]);

  // Loop animasi (berputar terus), melompati frame yang bolong.
  useEffect(() => {
    if (!playing || !enabled || frames.length < 2) return;
    const t = setInterval(
      () =>
        setIdx((i) => {
          const n = frames.length;
          let j = (i + 1) % n;
          let guard = 0;
          while (brokenRef.current.has(frames[j]?.url) && guard++ < n) j = (j + 1) % n;
          return j;
        }),
      PLAY_MS,
    );
    return () => clearInterval(t);
  }, [playing, enabled, frames]);

  /** Pengguna menggeser timeline. Berhenti mengikuti frame terbaru kecuali digeser ke ujung. */
  const scrub = useCallback((v: number) => {
    setIdx(v);
    followRef.current = v >= framesRef.current.length - 1;
  }, []);

  return { frames, idx, status, stale, echo, broken, loadedAt, load, markBroken, scrub };
}
