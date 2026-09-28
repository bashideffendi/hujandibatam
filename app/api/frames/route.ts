import type { Frame } from "@/lib/radar";
import type { EchoSummary, FramesResponse } from "@/lib/api-types";
import { MSS_FILE_BASE } from "@/lib/sources";
import { batamStats, type EchoStats } from "@/lib/echo";

// Citra radar 240km MSS terbit tiap 5 MENIT dengan jeda terbit ~8 menit. Daripada nebak
// jeda pakai angka tetap, server PROBE file paling baru yang BENERAN udah terbit, lalu
// susun 30 frame mundur dari situ → selalu sefresh mungkin.
//
// Sekalian menjawab pertanyaan inti — "kecamatan mana di Batam yang lagi hujan?" —
// dengan menghitung piksel PNG di daratan tiap kecamatan (lib/echo.ts). Frame terbaru
// selalu dihitung; kalau tak ada yang hujan, mundur maksimal 1 jam mencari hujan terakhir.
// Hasil per-ts di-cache di module (PNG per timestamp tidak pernah berubah).
//
// Dynamic: respons dihitung ulang per request (jam frame selalu terbaru). CDN boleh
// nahan 30 detik (s-maxage) — beda dengan ISR/prerender yang dulu bikin "jam beku":
// label jam di sini melekat per-frame, jadi cache ≤60 detik nggak bisa membekukan apa pun.
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const STEP_MIN = 5; // cadence file radar
const FRAME_COUNT = 30; // 30 x 5 mnt = 2,5 jam riwayat
const PROBE_BATCH = 4; // kandidat per batch (paralel)
const PROBE_BATCHES = 3; // 3 x 4 x 5 mnt = cover jeda terbit s/d ~60 mnt
const PROBE_TIMEOUT_MS = 4000;
const LAST_GOOD_MAX_AGE_MS = 3 * 3600 * 1000;
const ECHO_LOOKBACK = 12; // 12 x 5 mnt = 1 jam ke belakang
const ECHO_BATCH = 4;
const ECHO_CACHE_MAX = 90;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Date (UTC field = wall-clock SGT) -> "YYYYMMDDHHMM"
function tsOf(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}

function urlFor(ts: string): string {
  return `${MSS_FILE_BASE}/dpsri_240km_${ts}0000dBR.dpsri.png`;
}

function parseTs(ts: string): Date {
  // UTC field = wall-clock SGT
  return new Date(
    Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12)),
  );
}

// "YYYYMMDDHHMM" (SGT) -> {time, date} WIB. SGT = UTC+8, WIB = UTC+7.
function tsToWib(ts: string): { time: string; date: string } {
  const instant = new Date(parseTs(ts).getTime() - 8 * 3600 * 1000); // SGT -> instant UTC
  const opts = { timeZone: "Asia/Jakarta" } as const;
  const time = instant.toLocaleString("id-ID", { ...opts, hour: "2-digit", minute: "2-digit" });
  const date = instant.toLocaleString("id-ID", {
    ...opts,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return { time, date };
}

function toFrame(ts: string): Frame {
  const { time, date } = tsToWib(ts);
  return { url: urlFor(ts), ts, time, date };
}

async function exists(ts: string): Promise<boolean> {
  try {
    const r = await fetch(urlFor(ts), {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Hasil probe terakhir yang sukses — dipakai kalau MSS mendadak nggak bisa dihubungi.
let lastGood: { ts: string; at: number } | null = null;

// Timestamp file terbaru yang udah terbit — probe paralel per batch, mundur dari "sekarang" SGT.
async function newestTs(): Promise<{ ts: string | null; source: FramesResponse["source"] }> {
  const start = new Date(Date.now() + 8 * 3600 * 1000); // wall-clock SGT
  start.setUTCMinutes(start.getUTCMinutes() - (start.getUTCMinutes() % STEP_MIN), 0, 0);
  for (let b = 0; b < PROBE_BATCHES; b++) {
    const cands: string[] = [];
    for (let i = 0; i < PROBE_BATCH; i++) {
      const k = b * PROBE_BATCH + i;
      cands.push(tsOf(new Date(start.getTime() - k * STEP_MIN * 60000)));
    }
    const oks = await Promise.all(cands.map((ts) => exists(ts)));
    const i = oks.findIndex(Boolean);
    if (i >= 0) {
      lastGood = { ts: cands[i], at: Date.now() };
      return { ts: cands[i], source: "mss" };
    }
  }
  if (lastGood && Date.now() - lastGood.at < LAST_GOOD_MAX_AGE_MS) {
    return { ts: lastGood.ts, source: "lastGood" };
  }
  return { ts: null, source: "none" };
}

function framesEndingAt(endTs: string): Frame[] {
  const end = parseTs(endTs);
  const frames: Frame[] = [];
  for (let k = FRAME_COUNT - 1; k >= 0; k--) {
    frames.push(toFrame(tsOf(new Date(end.getTime() - k * STEP_MIN * 60000))));
  }
  return frames;
}

// --- echo sekitar Batam ---
// ts → stats. `null` = file memang tidak ada (404) → jangan diulang; kegagalan transien
// (timeout/decode) TIDAK di-cache supaya request berikutnya mencoba lagi.
const echoCache = new Map<string, EchoStats | null>();

async function echoFor(ts: string): Promise<EchoStats | null | undefined> {
  if (echoCache.has(ts)) return echoCache.get(ts);
  try {
    const r = await fetch(urlFor(ts), {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (r.status === 404) {
      echoCache.set(ts, null);
      return null;
    }
    if (!r.ok) return undefined;
    const stats = batamStats(Buffer.from(await r.arrayBuffer()));
    if (echoCache.size >= ECHO_CACHE_MAX) {
      const oldest = echoCache.keys().next().value;
      if (oldest !== undefined) echoCache.delete(oldest);
    }
    echoCache.set(ts, stats);
    return stats;
  } catch {
    return undefined;
  }
}

async function echoSummary(frames: Frame[]): Promise<EchoSummary | null> {
  const latest = frames[frames.length - 1];
  const now = await echoFor(latest.ts);
  if (!now) return null; // 404/gagal decode → jangan mengarang
  let lastTs: string | null = now.near ? latest.ts : null;
  if (!lastTs) {
    // mundur per batch (paralel), berhenti di echo pertama; batas 1 jam.
    const oldest = Math.max(0, frames.length - 1 - ECHO_LOOKBACK);
    for (let i = frames.length - 2; i >= oldest && !lastTs; i -= ECHO_BATCH) {
      const batch: string[] = [];
      for (let k = i; k > i - ECHO_BATCH && k >= oldest; k--) batch.push(frames[k].ts);
      const res = await Promise.all(batch.map(echoFor));
      const hit = res.findIndex((s) => s?.near);
      if (hit >= 0) lastTs = batch[hit];
    }
  }
  return {
    near: now.near,
    coverage: Math.round(now.coverage * 1000) / 1000,
    level: now.level,
    byClass: now.byClass,
    landKm2: now.landKm2,
    kec: now.kec,
    lastTs,
    lookbackMin: ECHO_LOOKBACK * STEP_MIN,
  };
}

export async function GET() {
  const { ts: endTs, source } = await newestTs();
  const headers = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" };
  if (!endTs) {
    // Nihil total: JANGAN kirim URL yang terbukti 404 seolah citra sah — klien
    // mempertahankan frames lama (kalau ada) dan menandai tertunda.
    const body: FramesResponse = { frames: [], count: 0, stale: true, ageMinutes: null, source, echo: null };
    return Response.json(body, { headers });
  }
  const frames = framesEndingAt(endTs);
  const endInstant = parseTs(endTs).getTime() - 8 * 3600 * 1000;
  const ageMinutes = Math.round((Date.now() - endInstant) / 60000);
  // stale: pakai hasil lama, atau frame terbaru > 18 mnt (MSS macet/terlambat)
  const stale = source !== "mss" || ageMinutes > 18;
  const echo = await echoSummary(frames);
  const body: FramesResponse = { frames, count: frames.length, stale, ageMinutes, source, echo };
  return Response.json(body, { headers });
}
