// Frame field gelombang OFS BMKG (WAVEWATCH III hi-res "w3g_hires", param swh).
//
// RESILIENSI: modelrun BMKG (Cloudflare) suka MEMBLOKIR fetch server-side. Strategi berlapis:
//  1) modelrun (paling fresh & akurat) — hasilnya di-cache 5 menit (run cuma ganti tiap 12 jam);
//  2) gagal → PROBE tile langsung buat nemu run TERBARU yang tile-nya beneran ADA — cache 10 mnt;
//  3) probe pun keblok → slot buta 00/12 UTC ≥15h lalu, cache cuma 60 detik (tebakan, bukan bukti).
// Request paralel berbagi SATU promise in-flight biar BMKG nggak dihajar.
// Respons kasih `source`, `ageH`, `expired` — klien yang memutuskan label jujurnya.
import type { OfsResponse } from "@/lib/api-types";
import { OFS_MODELRUN, OFS_REFERER, ofsTilePath } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const STEP_H = 3;
const HORIZON_H = 72;
const SAFE_LAG_H = 15;
const MODELRUN_TTL_MS = 5 * 60 * 1000;
const PROBE_TTL_MS = 10 * 60 * 1000;
const BLIND_TTL_MS = 60 * 1000;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
  Referer: OFS_REFERER,
};

type Source = OfsResponse["source"];

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(
    d.getUTCMinutes(),
  )}`;
}

// Slot run 00/12 UTC terdekat <= ms.
function slotFloor(ms: number): Date {
  const d = new Date(ms);
  const slot = d.getUTCHours() >= 12 ? 12 : 0;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), slot, 0, 0));
}

// Cek run punya tile? Path tile PERSIS sama dengan yang dipakai klien (lib/sources.ts).
async function runHasTiles(base: Date): Promise<boolean> {
  const valid = fmt(new Date(base.getTime() + 6 * 3600 * 1000));
  try {
    const r = await fetch(ofsTilePath(fmt(base), valid, 7, 100, 64), {
      cache: "no-store",
      redirect: "manual", // kalau BMKG pindah host lagi, ketahuan di log (bukan diam-diam ikut 301)
      signal: AbortSignal.timeout(2000),
      headers: BROWSER_HEADERS,
    });
    if (r.status >= 300 && r.status < 400) console.warn("[ofs] tile redirect →", r.headers.get("location"));
    return r.ok && (r.headers.get("content-type") ?? "").includes("image");
  } catch {
    return false;
  }
}

async function fetchModelrun(): Promise<Date | null> {
  try {
    const res = await fetch(OFS_MODELRUN, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      headers: BROWSER_HEADERS,
    });
    if (!res.ok) return null;
    const j = await res.json();
    const baseIso: string | undefined = j?.w3g_hires?.[0];
    if (!baseIso) return null;
    const d = new Date(baseIso);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null; // keblok/hang/HTML Cloudflare → fallback berlapis
  }
}

let cache: { base: Date; source: Source; at: number } | null = null;
let inflight: Promise<{ base: Date; source: Source }> | null = null;

function ttlOf(source: Source): number {
  return source === "modelrun" ? MODELRUN_TTL_MS : source === "probe" ? PROBE_TTL_MS : BLIND_TTL_MS;
}

async function resolveBase(): Promise<{ base: Date; source: Source }> {
  if (cache && Date.now() - cache.at < ttlOf(cache.source)) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const now = Date.now();
    let base = await fetchModelrun();
    let source: Source = "modelrun";
    if (!base) {
      // kandidat run TERBARU dulu: slot ~4h, ~16h, ~28h lalu (3 slot 12-jaman terbaru)
      for (let i = 0; i < 3 && !base; i++) {
        const cand = slotFloor(now - (4 + i * 12) * 3600 * 1000);
        if (await runHasTiles(cand)) {
          base = cand;
          source = "probe";
        }
      }
    }
    if (!base) {
      base = slotFloor(now - SAFE_LAG_H * 3600 * 1000);
      source = "blind";
    }
    cache = { base, source, at: Date.now() };
    return { base, source };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function GET() {
  const { base, source } = await resolveBase();
  const baserun = fmt(base);
  const now = Date.now();
  const frames: { valid: string; t: number }[] = [];
  for (let h = 0; h <= HORIZON_H; h += STEP_H) {
    const d = new Date(base.getTime() + h * 3600 * 1000);
    frames.push({ valid: fmt(d), t: d.getTime() });
  }
  // "Sekarang" = frame TERDEKAT ke jam ini (bukan floor 3-jaman yang bisa tertinggal 2 jam 59 mnt).
  let nowIndex = 0;
  let best = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const dist = Math.abs(frames[i].t - now);
    if (dist < best) {
      best = dist;
      nowIndex = i;
    }
  }
  const ageH = Math.round((now - base.getTime()) / 3600000);
  const expired = now > frames[frames.length - 1].t;
  const body: OfsResponse = {
    baserun,
    frames: frames.map((f) => f.valid),
    nowIndex,
    fallback: source !== "modelrun",
    source,
    ageH,
    expired,
  };
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
