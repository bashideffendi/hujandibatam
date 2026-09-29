// Penguraian prakiraan perairan Batam dari API maritim BMKG "marine2026-data" (sejak
// ±Sep 2026; jalur lama public_api/perairan/E.02.json 404). Fungsi murni: dipakai
// app/api/perairan/route.ts dan bisa diuji tanpa jaringan.
//
// Sumber (dok resmi: maritim.bmkg.go.id/apidoc):
//  - perairan/P.R.02.json  "Perairan Kep. Batam", Stamet Hang Nadim. forecast_day1 per 1 jam
//    (24 titik 00–23 UTC), forecast_day2-4 per 3 jam. Waktu "YYYY-MM-DD HH:00 UTC".
//    Satuan: tinggi gelombang meter, angin/gust KNOT, arus KNOT, suhu °C, RH %.
//  - warning/warnings.json  peringatan dini gelombang per provinsi: key "Kep. Riau" →
//    data.warning.{sedang,tinggi,sangat_tinggi,ekstrem} = daftar NAMA perairan, berlaku
//    data.valid_from–valid_until (jam lokal, time_zone "WIB").
// Tidak ada lagi teks peringatan per perairan (dulu warning_desc) → peringatan HANYA dari
// daftar resmi itu, tidak diturunkan sendiri dari angka angin/gelombang.
import type { PerairanEntry, PerairanResponse, PerairanWarn } from "./api-types";

export const PERAIRAN_CODE = "P.R.02";
export const PERAIRAN_NAME = "Perairan Kep. Batam";
const WARN_PROVINCE = "Kep. Riau";

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;

/** "2026-09-29 00:00 UTC" → ms epoch (NaN kalau format lain). */
export function parseUtc(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC$/.exec(s.trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}
/** "2026-09-29T07:00" (WIB, tanpa zona) → ms epoch. */
function parseWib(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s.trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 7 * 3600e3 : NaN;
}

type Slot = { from: number; to: number; d: Raw };

/** Semua titik prakiraan (hari 1 per jam + hari 2–4 per 3 jam), urut waktu, dengan akhir jendela. */
function slots(j: Raw): Slot[] {
  const a = [
    ...((Array.isArray(j.forecast_day1) ? j.forecast_day1 : []) as Raw[]),
    ...((Array.isArray(j["forecast_day2-4"]) ? j["forecast_day2-4"] : []) as Raw[]),
  ]
    .map((d) => ({ at: parseUtc(str(d.time)), d }))
    .filter((e) => !Number.isNaN(e.at))
    .sort((x, y) => x.at - y.at);
  return a.map((e, i) => {
    const next = a[i + 1]?.at;
    // titik terakhir: anggap selebar jarak ke titik sebelumnya (3 jam di hari 2–4)
    const step = i > 0 ? e.at - a[i - 1].at : 3600e3;
    return { from: e.at, to: next ?? e.at + step, d: e.d };
  });
}

// Rentang kategori peringatan BMKG (meter) untuk teks peringatan.
const WARN_LEVELS: { key: string; label: string; range: string }[] = [
  { key: "ekstrem", label: "Ekstrem", range: "≥6 m" },
  { key: "sangat_tinggi", label: "Sangat Tinggi", range: "4–6 m" },
  { key: "tinggi", label: "Tinggi", range: "2,5–4 m" },
  { key: "sedang", label: "Sedang", range: "1,25–2,5 m" },
];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Buletin berikut (terbit ±12 jam sebelum berlaku) ikut dikirim kalau mulainya ≤24 jam lagi. */
const WARN_LEAD_MS = 24 * 3600e3;

/**
 * Satu buletin peringatan dini gelombang dari warnings.json → masa berlaku + teks untuk Batam
 * ("" = BMKG tidak menyebut Perairan Kep. Batam). null kalau skema tak dikenali.
 */
export function parseBulletin(w: Raw): PerairanWarn | null {
  const prov = (w[WARN_PROVINCE] as Raw | undefined)?.data as Raw | undefined;
  const lists = prov?.warning as Record<string, unknown> | undefined;
  if (!prov || !lists || typeof lists !== "object") return null;
  const from = parseWib(str(prov.valid_from));
  const until = parseWib(str(prov.valid_until));
  if (Number.isNaN(from) || Number.isNaN(until)) return null;
  let text = "";
  for (const lv of WARN_LEVELS) {
    const names = Array.isArray(lists[lv.key]) ? (lists[lv.key] as unknown[]).map((x) => norm(str(x))) : [];
    if (names.includes(norm(PERAIRAN_NAME))) {
      text = `Peringatan Gelombang ${lv.label} ${lv.range}`;
      break;
    }
  }
  return { status: "ok", text, from: new Date(from).toISOString(), until: new Date(until).toISOString() };
}

/**
 * Status peringatan pada `now` dari daftar buletin yang diketahui:
 *  - `current`: buletin yang masa berlakunya mencakup now (yang mulainya paling akhir); kalau
 *    tak ada → status "unknown" — BMKG menimpa warnings.json ±19.00 WIB dengan buletin yang
 *    baru berlaku 07.00 WIB esoknya, jadi malam hari buletin yang berlaku bisa sudah hilang;
 *  - `next`: buletin yang mulai ≤24 jam lagi (bisa sama isinya dengan current).
 * Dipakai server (kolom lama) DAN klien (dengan jamnya sendiri).
 */
export function warnAt(
  warns: PerairanWarn[] | undefined,
  now: number,
): { current: PerairanWarn; next: PerairanWarn | null } {
  const t = (iso: string) => Date.parse(iso);
  const list = (warns ?? []).filter((w) => w.status === "ok");
  // mulai paling akhir menang; seri → yang terakhir di daftar (paling baru diambil server)
  const current = list
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => t(w.from) <= now && now < t(w.until))
    .sort((a, b) => t(b.w.from) - t(a.w.from) || b.i - a.i)[0]?.w ?? { status: "unknown", text: "", from: "", until: "" };
  const next =
    list
      .filter((w) => t(w.from) > now && t(w.from) - now <= WARN_LEAD_MS)
      .sort((a, b) => t(a.from) - t(b.from))[0] ?? null;
  return { current, next };
}

/** Teks kolom lama `warning` untuk bundel lama: jangan pernah menyiratkan "tidak ada" saat tak tahu. */
function legacyWarning(warns: PerairanWarn[], now: number): string {
  const { current, next } = warnAt(warns, now);
  if (current.status === "ok") return current.text;
  return next?.text || "Status Peringatan Belum Tersedia";
}

const EMPTY: PerairanResponse = { code: PERAIRAN_CODE, name: PERAIRAN_NAME, issued: "", current: null, upcoming: false };
export const emptyPerairan = (): PerairanResponse => ({ ...EMPTY });

const SLOTS_AHEAD_MS = 48 * 3600e3;

/** Ubah satu titik mentah jadi PerairanEntry (kolom lama tetap diisi demi bundel lama). */
function toEntry(all: Slot[], i: number, warning: string, warningUntil: string): PerairanEntry {
  const s = all[i];
  const d = s.d;
  const waveM = num(d.wave_height);
  const windKt = num(d.wind_speed);
  const gustKt = num(d.wind_gust);
  // 12 jam ke depan (termasuk slot ini): rentang tinggi
  const ahead = all.filter((x) => x.to > s.from && x.from < s.from + 12 * 3600e3);
  const hs = ahead.map((x) => num(x.d.wave_height)).filter((v): v is number => v !== null);
  return {
    validFrom: new Date(s.from).toISOString(),
    validTo: new Date(s.to).toISOString(),
    timeDesc: "",
    waveCat: str(d.wave_cat),
    waveDesc: waveM !== null ? `${waveM} m` : "",
    windFrom: str(d.wind_from),
    windTo: "",
    windMinKt: windKt,
    windMaxKt: gustKt ?? windKt,
    weather: str(d.weather),
    weatherDesc: "",
    warning,
    waveM,
    windKt,
    gustKt,
    currentTo: str(d.current_to),
    currentKt: num(d.current_speed),
    next12: hs.length ? { minM: Math.min(...hs), maxM: Math.max(...hs) } : null,
    warningUntil,
    station: "",
  };
}

/**
 * Susun respons: `slots` = titik yang belum lewat (maks 48 jam ke depan) supaya KLIEN memilih
 * jam yang berlaku dengan jamnya sendiri (respons boleh di-cache tanpa jadi basi tiap jam);
 * `current`/`upcoming` = pilihan server saat ini untuk bundel lama.
 */
export function pickPerairan(j: Raw, bulletins: PerairanWarn[], now: number): PerairanResponse {
  const all = slots(j);
  const warns = bulletins.filter((w) => w.status === "ok" && Date.parse(w.until) > now);
  const legacy = legacyWarning(warns, now);
  const cur = warnAt(warns, now).current;
  const station = str(j.nama_stasiun);
  const base = {
    code: str(j.code) || PERAIRAN_CODE,
    name: str(j.name) || PERAIRAN_NAME,
    issued: str(j.issued),
    station,
    warns,
  };
  const keep: PerairanEntry[] = [];
  all.forEach((x, i) => {
    if (x.to > now && x.from < now + SLOTS_AHEAD_MS)
      keep.push({ ...toEntry(all, i, legacy, cur.status === "ok" ? cur.until : ""), station });
  });
  const picked = currentSlot({ slots: keep } as PerairanResponse, now);
  return { ...base, current: picked.entry, upcoming: picked.upcoming, slots: keep };
}

/**
 * Slot yang berlaku pada `now` (from ≤ now < to), atau yang terdekat ke depan (upcoming).
 * Respons lama tanpa `slots` → pakai `current` dari server apa adanya.
 */
export function currentSlot(p: PerairanResponse | null, now: number): { entry: PerairanEntry | null; upcoming: boolean } {
  if (!p) return { entry: null, upcoming: false };
  if (!p.slots) return { entry: p.current ?? null, upcoming: !!p.upcoming };
  const t = (iso: string) => Date.parse(iso);
  const cur = p.slots.find((e) => t(e.validFrom) <= now && now < t(e.validTo));
  if (cur) return { entry: cur, upcoming: false };
  const next = p.slots.find((e) => t(e.validFrom) > now);
  return next ? { entry: next, upcoming: true } : { entry: null, upcoming: false };
}
