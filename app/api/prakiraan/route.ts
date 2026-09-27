// Prakiraan cuaca BMKG per kelurahan (3-jaman, 3 hari) untuk pusat Kota Batam.
// Ini satu-satunya data cuaca di mode HUJAN yang PERSIS Batam — sisanya proksi Singapura.
//
// Ditarik dari SERVER (bukan browser): hemat kuota BMKG (60 permintaan/menit/IP), IP
// pengguna tidak terkirim ke BMKG, dan respons bisa ditahan CDN. Atribusi BMKG wajib.
import type { ForecastResponse, ForecastSlot } from "@/lib/api-types";
import { BMKG_FORECAST, BMKG_FORECAST_PLACE } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const FETCH_TIMEOUT_MS = 8000;
const LAST_GOOD_MAX_MS = 6 * 3600 * 1000;
const SLOTS = 4;
// Slot = prakiraan sesaat tiap 3 jam. Yang sudah lewat > 90 menit tidak lagi mewakili "kini".
const PAST_TOLERANCE_MS = 90 * 60 * 1000;
const OK_HEADERS = { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" };

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))
      ? Number(v)
      : null;

// "2026-09-27 01:00:00" (UTC) → ms epoch
function parseUtc(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}
// ms epoch → "08.00" WIB
function wibTime(ms: number): string {
  const d = new Date(ms + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}.${p(d.getUTCMinutes())}`;
}

let lastGood: { raw: Raw; at: number } | null = null;

function shape(j: Raw): ForecastResponse {
  const first = (Array.isArray(j.data) ? j.data[0] : null) as Raw | null;
  const lokasi = ((first?.lokasi ?? j.lokasi) as Raw | undefined) ?? {};
  const days = (Array.isArray(first?.cuaca) ? first.cuaca : []) as unknown[];
  const flat = days.flatMap((d) => (Array.isArray(d) ? (d as Raw[]) : []));
  const now = Date.now();
  const slots: ForecastSlot[] = flat
    .map((s) => ({ s, at: parseUtc(str(s.utc_datetime)) }))
    .filter((x) => !Number.isNaN(x.at) && x.at >= now - PAST_TOLERANCE_MS)
    .sort((a, b) => a.at - b.at)
    .slice(0, SLOTS)
    .map(({ s, at }) => ({
      utc: new Date(at).toISOString(),
      time: wibTime(at),
      desc: str(s.weather_desc),
      t: num(s.t),
      hu: num(s.hu),
      tp: num(s.tp),
    }));
  const desa = str(lokasi.desa);
  const kec = str(lokasi.kecamatan);
  const analysis = str(flat[0]?.analysis_date);
  return {
    place: BMKG_FORECAST_PLACE,
    detail: [desa, kec].filter(Boolean).join(", "),
    analysis: analysis || null,
    slots,
  };
}

export async function GET() {
  try {
    const res = await fetch(BMKG_FORECAST, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const raw = (await res.json()) as Raw;
    if (!Array.isArray(raw.data) || !raw.data.length) throw new Error("schema: data kosong");
    lastGood = { raw, at: Date.now() };
    return Response.json(shape(raw), { headers: OK_HEADERS });
  } catch (e) {
    console.warn("[prakiraan] gagal:", (e as Error)?.message);
    // Slot dipilih ulang dari jam sekarang, jadi data lama tetap jujur selama masih ada slot ke depan.
    if (lastGood && Date.now() - lastGood.at < LAST_GOOD_MAX_MS) {
      const body = shape(lastGood.raw);
      if (body.slots.length) {
        return Response.json(body, { headers: { "Cache-Control": "public, s-maxage=120" } });
      }
    }
    const empty: ForecastResponse = { place: BMKG_FORECAST_PLACE, detail: "", analysis: null, slots: [] };
    return Response.json(empty, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
