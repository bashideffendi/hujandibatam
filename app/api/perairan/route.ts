// Prakiraan teks resmi BMKG untuk wilayah perairan "Perairan Kep. Batam" (E.02):
// kategori & rentang tinggi gelombang, angin, cuaca, dan PERINGATAN DINI. Ini data yang
// persis Batam (bukan proksi) — pelengkap field warna OFS di mode OMBAK.
//
// JEBAKAN: `time_desc` ("Hari ini"/"Besok") relatif ke jam TERBIT, bukan jam sekarang
// (terbit 23.39 UTC → pagi harinya entri "Besok" yang berlaku). Pilih entri dari jendela
// valid_from ≤ now < valid_to; kalau tak ada, ambil yang terdekat ke depan (upcoming).
// WAF BMKG menolak User-Agent "Mozilla/5.0" polos tapi menerima UA browser lengkap.
import type { PerairanEntry, PerairanResponse } from "@/lib/api-types";
import { OFS_PERAIRAN, OFS_REFERER } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: OFS_REFERER,
};
// Latensi BMKG terukur 0,7–3,6 dtk → 8 dtk (4 dtk pernah bikin 503 di panggilan pertama).
const FETCH_TIMEOUT_MS = 8000;
const LAST_GOOD_MAX_MS = 12 * 3600 * 1000;
const OK_HEADERS = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" };
const EMPTY: PerairanResponse = {
  code: "E.02",
  name: "Perairan Kep. Batam",
  issued: "",
  current: null,
  upcoming: false,
};

type Raw = Record<string, unknown>;

// "2026-09-26 00:00 UTC" → ms epoch
function parseUtc(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC$/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;

// Data mentah terakhir yang berhasil ditarik. Entri dipilih ULANG tiap request dari jendela
// valid_from/valid_to, jadi memakai data lama tetap jujur selama jendelanya masih berlaku.
let lastGood: { raw: Raw; at: number } | null = null;

function pick(j: Raw): PerairanResponse {
  const data = (Array.isArray(j.data) ? j.data : []) as Raw[];
  const now = Date.now();
  const entries = data
    .map((d) => ({ from: parseUtc(str(d.valid_from)), to: parseUtc(str(d.valid_to)), d }))
    .filter((e) => !Number.isNaN(e.from) && !Number.isNaN(e.to))
    .sort((a, b) => a.from - b.from);
  let cur = entries.find((e) => e.from <= now && now < e.to);
  let upcoming = false;
  if (!cur) {
    cur = entries.find((e) => e.from > now);
    upcoming = !!cur;
  }
  const entry: PerairanEntry | null = cur
    ? {
        validFrom: new Date(cur.from).toISOString(),
        validTo: new Date(cur.to).toISOString(),
        timeDesc: str(cur.d.time_desc),
        waveCat: str(cur.d.wave_cat),
        waveDesc: str(cur.d.wave_desc),
        windFrom: str(cur.d.wind_from),
        windTo: str(cur.d.wind_to),
        windMinKt: num(cur.d.wind_speed_min),
        windMaxKt: num(cur.d.wind_speed_max),
        weather: str(cur.d.weather),
        weatherDesc: str(cur.d.weather_desc),
        warning: str(cur.d.warning_desc).trim(),
      }
    : null;
  return {
    code: str(j.code) || EMPTY.code,
    name: str(j.name) || EMPTY.name,
    issued: str(j.issued),
    current: entry,
    upcoming,
  };
}

export async function GET() {
  try {
    const res = await fetch(OFS_PERAIRAN, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: HEADERS,
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const raw = (await res.json()) as Raw;
    if (!Array.isArray(raw.data)) throw new Error("schema: data bukan array");
    lastGood = { raw, at: Date.now() };
    return Response.json(pick(raw), { headers: OK_HEADERS });
  } catch (e) {
    console.warn("[perairan] gagal:", (e as Error)?.message);
    if (lastGood && Date.now() - lastGood.at < LAST_GOOD_MAX_MS) {
      return Response.json(pick(lastGood.raw), { headers: { "Cache-Control": "public, s-maxage=120" } });
    }
    return Response.json(EMPTY, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
