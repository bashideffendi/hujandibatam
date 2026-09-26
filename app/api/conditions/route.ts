// Kondisi tambahan dari NEA Singapura (server-side digabung, SATU lapis cache):
//  - Kualitas udara: PSI 24-jam + PM2.5 24-jam region SOUTH (proxy haze Batam —
//    asap Sumatra/Riau itu plume yang sama yang kena SG selatan & Batam).
//  - Angin: kecepatan + arah stasiun Semakau (S102, paling selatan, menghadap Batam).
//  - Hujan terdekat: gauge NEA paling selatan (lat ≤ 1.3) — leading edge buat Batam.
//  - UV jam berjalan (lintang ~sama → transferable).
//  - Nowcast 2 jam area "Southern Islands" — satu-satunya sinyal PREDIKTIF yang murah.
// Semua = PROKSI Singapura; UI wajib bilang begitu (bukan cuma di tooltip).
//
// Dynamic + cache: dulu 3 lapis (ISR 300 + Data Cache 300 + CDN 300/600) bikin hujan
// "5 menit" bisa basi 10-20 menit. Sekarang fetch NEA revalidate 120 + CDN s-maxage 60.
import type {
  AqReading,
  ConditionsResponse,
  NowcastReading,
  RainReading,
  UvReading,
  WindReading,
} from "@/lib/api-types";
import { NEA } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const STATION = "S102"; // Semakau
const SOUTH_LAT = 1.3; // batas: stasiun paling selatan SG (terdekat ke Batam)
const NOWCAST_AREAS = ["Southern Islands", "Sentosa"]; // urutan prioritas
const FETCH_MS = 3000;
// Bacaan lebih tua dari ini dibuang (feed macet ≠ kondisi sekarang).
const MAX_AGE_FAST_MS = 30 * 60 * 1000; // hujan, angin
const MAX_AGE_SLOW_MS = 2 * 3600 * 1000; // PSI, UV

const COMPASS = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"]; // 8 arah mata angin
function compass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

function band(psi: number): { label: string; color: string } {
  if (psi <= 50) return { label: "Baik", color: "#1aa06a" };
  if (psi <= 100) return { label: "Sedang", color: "#d99a2b" };
  if (psi <= 200) return { label: "Tidak Sehat", color: "#e2683c" };
  if (psi <= 300) return { label: "Sangat Tidak Sehat", color: "#dc3545" };
  return { label: "Berbahaya", color: "#8a1a4a" };
}

function uvBand(v: number): { label: string; color: string } {
  if (v <= 2) return { label: "Rendah", color: "#1aa06a" };
  if (v <= 5) return { label: "Sedang", color: "#d99a2b" };
  if (v <= 7) return { label: "Tinggi", color: "#e2683c" };
  if (v <= 10) return { label: "Sangat Tinggi", color: "#dc3545" };
  return { label: "Ekstrem", color: "#8a1a4a" };
}

// Kosakata nowcast NEA (tetap) → Bahasa Indonesia ringkas. Yang tak dikenal ditampilkan apa adanya.
const NOWCAST_ID: Record<string, { text: string; rain: boolean }> = {
  Fair: { text: "Cerah", rain: false },
  "Fair (Day)": { text: "Cerah", rain: false },
  "Fair (Night)": { text: "Cerah", rain: false },
  "Fair and Warm": { text: "Cerah & panas", rain: false },
  "Partly Cloudy": { text: "Cerah berawan", rain: false },
  "Partly Cloudy (Day)": { text: "Cerah berawan", rain: false },
  "Partly Cloudy (Night)": { text: "Cerah berawan", rain: false },
  Cloudy: { text: "Berawan", rain: false },
  Hazy: { text: "Berkabut asap", rain: false },
  "Slightly Hazy": { text: "Sedikit berkabut asap", rain: false },
  Windy: { text: "Berangin", rain: false },
  Mist: { text: "Berkabut", rain: false },
  Fog: { text: "Kabut", rain: false },
  "Light Rain": { text: "Hujan ringan", rain: true },
  "Moderate Rain": { text: "Hujan sedang", rain: true },
  "Heavy Rain": { text: "Hujan lebat", rain: true },
  "Passing Showers": { text: "Hujan sebentar", rain: true },
  "Light Showers": { text: "Hujan ringan", rain: true },
  Showers: { text: "Hujan", rain: true },
  "Heavy Showers": { text: "Hujan lebat", rain: true },
  "Thundery Showers": { text: "Hujan petir", rain: true },
  "Heavy Thundery Showers": { text: "Hujan petir lebat", rain: true },
  "Heavy Thundery Showers with Gusty Winds": { text: "Hujan petir lebat + angin kencang", rain: true },
};

type Json = Record<string, unknown>;

// fetch JSON dengan timeout; bedakan http/schema/empty di log Vercel (bukan null diam-diam).
async function getJson(name: string, url: string): Promise<Json | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 120 }, signal: AbortSignal.timeout(FETCH_MS) });
    if (!res.ok) {
      console.warn(`[conditions] ${name} http ${res.status}`);
      return null;
    }
    return (await res.json()) as Json;
  } catch (e) {
    console.warn(`[conditions] ${name} fetch gagal`, (e as Error)?.message);
    return null;
  }
}
function drift(name: string, what: string): null {
  console.warn(`[conditions] schema drift: ${name} — ${what}`);
  return null;
}
function fresh(ts: string | null, maxAgeMs: number): boolean {
  if (!ts) return true; // nggak ada cap waktu → nggak bisa divonis basi
  const t = Date.parse(ts);
  return Number.isNaN(t) ? true : Date.now() - t <= maxAgeMs;
}

async function getAq(): Promise<AqReading | null> {
  const j = await getJson("psi", NEA.psi);
  if (!j) return null;
  const item = (j as { items?: Array<Json> }).items?.[0];
  const r = item?.readings as Json | undefined;
  const psi = (r?.psi_twenty_four_hourly as Json | undefined)?.south;
  if (typeof psi !== "number") return drift("psi", "psi_twenty_four_hourly.south bukan angka");
  // Endpoint PSI TIDAK punya pm25_one_hourly (itu endpoint /pm25 terpisah) — pakai 24-jam yang ada.
  const pm25 = (r?.pm25_twenty_four_hourly as Json | undefined)?.south;
  const ts = typeof item?.timestamp === "string" ? item.timestamp : null;
  if (!fresh(ts, MAX_AGE_SLOW_MS)) return drift("psi", `bacaan basi ${ts}`);
  return { psi, pm25: typeof pm25 === "number" ? pm25 : null, ...band(psi), ts };
}

// Ambil 1 nilai dari format v2 real-time NEA, pilih stasiun S102 (atau paling selatan).
async function pickStation(
  name: string,
  url: string,
): Promise<{ value: number | null; name?: string; unit?: string; ts: string | null }> {
  const j = await getJson(name, url);
  if (!j) return { value: null, ts: null };
  const d = (j.data ?? {}) as Json;
  const stations = (d.stations ?? []) as Array<{ id: string; name?: string; location?: { latitude?: number } }>;
  const reading = ((d.readings as Array<Json> | undefined) ?? [])[0];
  const data = (reading?.data ?? []) as Array<{ stationId: string; value: number }>;
  let st = stations.find((s) => s.id === STATION);
  if (!st && stations.length) {
    st = [...stations].sort((a, b) => (a.location?.latitude ?? 99) - (b.location?.latitude ?? 99))[0];
  }
  const v = data.find((x) => x.stationId === st?.id)?.value;
  if (typeof v !== "number") {
    drift(name, `nilai stasiun ${st?.id ?? "?"} tidak ada`);
    return { value: null, ts: null };
  }
  return {
    value: v,
    name: st?.name,
    unit: typeof d.readingUnit === "string" ? d.readingUnit : undefined,
    ts: typeof reading?.timestamp === "string" ? reading.timestamp : null,
  };
}

async function getWind(): Promise<WindReading | null> {
  const [sp, di] = await Promise.all([
    pickStation("wind-speed", NEA.windSpeed),
    pickStation("wind-direction", NEA.windDir),
  ]);
  if (sp.value === null || di.value === null) return null;
  if (!fresh(sp.ts, MAX_AGE_FAST_MS)) return drift("wind", `bacaan basi ${sp.ts}`);
  // readingUnit NEA = knots; warga awam lebih kenal km/jam (1 kt = 1,852 km/j).
  const knots = sp.unit && sp.unit !== "knots" ? sp.value / 1.852 : sp.value;
  return {
    speed: Math.round(knots * 1.852),
    knots: Math.round(knots),
    deg: Math.round(di.value),
    label: compass(di.value),
    station: sp.name ?? di.name,
    ts: sp.ts,
  };
}

// Hujan terdekat: mm tertinggi 5-menit di antara stasiun NEA paling selatan. Cuma kalau mm > 0.
async function getRain(): Promise<RainReading | null> {
  const j = await getJson("rainfall", NEA.rain);
  if (!j) return null;
  const stations = ((j.metadata as Json | undefined)?.stations ?? []) as Array<{
    id: string;
    name?: string;
    location?: { latitude?: number };
  }>;
  const item = (j as { items?: Array<Json> }).items?.[0];
  const readings = (item?.readings ?? []) as Array<{ station_id: string; value: number }>;
  if (!stations.length || !Array.isArray(item?.readings)) return drift("rainfall", "stations/readings kosong");
  const ts = typeof item?.timestamp === "string" ? item.timestamp : null;
  if (!fresh(ts, MAX_AGE_FAST_MS)) return drift("rainfall", `bacaan basi ${ts}`);
  const south = new Map<string, string>();
  for (const s of stations) {
    const lat = s?.location?.latitude;
    if (typeof lat === "number" && lat <= SOUTH_LAT) south.set(s.id, s.name ?? s.id);
  }
  let best: RainReading | null = null;
  for (const r of readings) {
    if (south.has(r.station_id) && typeof r.value === "number" && r.value > (best?.mm ?? 0)) {
      best = { mm: Math.round(r.value * 10) / 10, station: south.get(r.station_id)!, ts };
    }
  }
  return best && best.mm > 0 ? best : null;
}

// Indeks UV jam berjalan. Hidden kalau 0 (malam) biar strip nggak penuh chip kosong.
async function getUv(): Promise<UvReading | null> {
  const j = await getJson("uv-index", NEA.uv);
  if (!j) return null;
  const item = (j as { items?: Array<Json> }).items?.[0];
  const arr = (item?.index ?? []) as Array<{ value: number; timestamp: string }>;
  if (!Array.isArray(item?.index)) return drift("uv-index", "items[0].index bukan array");
  // HARUS nilai jam berjalan (cocok timestamp). JANGAN fallback ke max harian.
  const cur = arr.find((e) => e.timestamp === item?.timestamp);
  const value = typeof cur?.value === "number" ? cur.value : null;
  if (value === null || value <= 0) return null;
  const ts = typeof item?.timestamp === "string" ? item.timestamp : null;
  if (!fresh(ts, MAX_AGE_SLOW_MS)) return drift("uv-index", `bacaan basi ${ts}`);
  return { value, ...uvBand(value), ts };
}

async function getNowcast(): Promise<NowcastReading | null> {
  const j = await getJson("two-hr-forecast", NEA.nowcast);
  if (!j) return null;
  const item = ((j.data as Json | undefined)?.items as Array<Json> | undefined)?.[0];
  const forecasts = (item?.forecasts ?? []) as Array<{ area: string; forecast: string }>;
  const vp = item?.valid_period as { start?: string; end?: string } | undefined;
  if (!Array.isArray(item?.forecasts) || !vp?.end) return drift("two-hr-forecast", "forecasts/valid_period");
  if (Date.parse(vp.end) < Date.now()) return drift("two-hr-forecast", `sudah lewat ${vp.end}`);
  for (const area of NOWCAST_AREAS) {
    const f = forecasts.find((x) => x.area === area);
    if (f?.forecast) {
      const m = NOWCAST_ID[f.forecast];
      return {
        raw: f.forecast,
        text: m?.text ?? f.forecast,
        rain: m?.rain ?? /rain|shower|thunder/i.test(f.forecast),
        area,
        validFrom: vp.start ?? "",
        validTo: vp.end,
      };
    }
  }
  return drift("two-hr-forecast", "area Southern Islands/Sentosa tidak ada");
}

export async function GET() {
  const [aq, wind, rain, uv, nowcast] = await Promise.all([
    getAq(),
    getWind(),
    getRain(),
    getUv(),
    getNowcast(),
  ]);
  const body: ConditionsResponse = { aq, wind, rain, uv, nowcast, asOf: new Date().toISOString() };
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
