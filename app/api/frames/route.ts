import type { Frame } from "@/lib/radar";
import type { FramesResponse } from "@/lib/api-types";
import { MSS_FILE_BASE } from "@/lib/sources";

// Citra radar 240km MSS terbit tiap 5 MENIT dengan jeda terbit ~8 menit. Daripada nebak
// jeda pakai angka tetap, server PROBE file paling baru yang BENERAN udah terbit, lalu
// susun 30 frame mundur dari situ → selalu sefresh mungkin.
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

export async function GET() {
  const { ts: endTs, source } = await newestTs();
  const headers = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" };
  if (!endTs) {
    // Nihil total: JANGAN kirim URL yang terbukti 404 seolah citra sah — klien
    // mempertahankan frames lama (kalau ada) dan menandai tertunda.
    const body: FramesResponse = { frames: [], count: 0, stale: true, ageMinutes: null, source };
    return Response.json(body, { headers });
  }
  const frames = framesEndingAt(endTs);
  const endInstant = parseTs(endTs).getTime() - 8 * 3600 * 1000;
  const ageMinutes = Math.round((Date.now() - endInstant) / 60000);
  // stale: pakai hasil lama, atau frame terbaru > 18 mnt (MSS macet/terlambat)
  const stale = source !== "mss" || ageMinutes > 18;
  const body: FramesResponse = { frames, count: frames.length, stale, ageMinutes, source };
  return Response.json(body, { headers });
}
