// Bentuk respons route handler — DIPAKAI BERSAMA server (anotasi tipe) & klien (import),
// biar field nggak "disalin tangan" lalu diam-diam beda.
import type { Frame } from "./radar";

export type EchoSummary = {
  /** ada echo radar berarti di kotak Batam ±20 km pada frame terbaru */
  near: boolean;
  /** fraksi kotak yang ber-echo pada frame terbaru, 0–1 */
  coverage: number;
  /** kelas intensitas tertinggi (dari palet MSS): ringan | sedang | lebat */
  level: "ringan" | "sedang" | "lebat" | null;
  /** ts (SGT) frame terakhir yang punya echo dalam jendela lookback; null = tidak ada */
  lastTs: string | null;
  /** panjang jendela yang diperiksa ke belakang, menit */
  lookbackMin: number;
};

export type FramesResponse = {
  frames: Frame[];
  count: number;
  /** MSS nggak nerbitin apa-apa (atau frame terbaru > 18 mnt). */
  stale: boolean;
  /** umur frame terbaru (menit) saat respons dibuat; null kalau frames kosong. */
  ageMinutes: number | null;
  /** "mss" = probe nemu file; "lastGood" = pakai hasil probe sebelumnya (≤3 jam); "none" = nihil. */
  source: "mss" | "lastGood" | "none";
  /** deteksi echo sekitar Batam dari piksel PNG (null kalau decode gagal). */
  echo: EchoSummary | null;
};

/** Prakiraan teks resmi BMKG per wilayah perairan (Batam = E.02 "Perairan Kep. Batam"). */
export type PerairanEntry = {
  validFrom: string; // ISO UTC
  validTo: string; // ISO UTC
  timeDesc: string; // "Hari ini", "Besok", …
  waveCat: string; // Tenang/Rendah/Sedang/Tinggi/…
  waveDesc: string; // "0.5 - 1.25 m"
  windFrom: string;
  windTo: string;
  windMinKt: number | null;
  windMaxKt: number | null;
  weather: string;
  weatherDesc: string;
  /** peringatan dini; kosong = tidak ada */
  warning: string;
};
export type PerairanResponse = {
  code: string;
  name: string;
  issued: string;
  /** entri yang mencakup jam sekarang, atau yang terdekat ke depan */
  current: PerairanEntry | null;
  /** true kalau `current` belum mulai (jendela sekarang tidak ada di data) */
  upcoming: boolean;
};

export type AqReading = { psi: number; pm25: number | null; label: string; color: string; ts: string | null };
export type WindReading = {
  /** km/jam (dibulatkan) */
  speed: number;
  /** knot mentah dari NEA */
  knots: number;
  deg: number;
  label: string;
  station?: string;
  ts: string | null;
};
export type RainReading = { mm: number; station: string; ts: string | null };
export type UvReading = { value: number; label: string; color: string; ts: string | null };
export type NowcastReading = {
  /** teks asli NEA, mis. "Light Rain" */
  raw: string;
  /** terjemahan ringkas, mis. "Hujan ringan" */
  text: string;
  rain: boolean;
  area: string;
  validFrom: string;
  validTo: string;
};

export type ConditionsResponse = {
  aq: AqReading | null;
  wind: WindReading | null;
  rain: RainReading | null;
  uv: UvReading | null;
  nowcast: NowcastReading | null;
  /** ISO saat respons dirakit (buat debugging kesegaran). */
  asOf: string;
};

/** Prakiraan cuaca BMKG per kelurahan (3-jaman) — data yang PERSIS Batam, bukan proksi. */
export type ForecastSlot = {
  /** ISO UTC */
  utc: string;
  /** jam WIB siap-tampil, "11.00" */
  time: string;
  /** deskripsi BMKG apa adanya, mis. "Hujan Ringan", "Udara Kabur" */
  desc: string;
  /** suhu °C */
  t: number | null;
  /** kelembapan % */
  hu: number | null;
  /** curah hujan mm */
  tp: number | null;
};
export type ForecastResponse = {
  /** nama pendek buat UI, mis. "Batam Kota" */
  place: string;
  /** "Teluk Tering, Batam Kota" */
  detail: string;
  /** waktu analisis model (ISO), kalau ada */
  analysis: string | null;
  /** slot mulai dari yang paling dekat dengan jam sekarang */
  slots: ForecastSlot[];
};

export type OfsResponse = {
  baserun: string;
  frames: string[];
  nowIndex: number;
  /** true kalau baserun BUKAN dari modelrun (probe/blind). */
  fallback: boolean;
  source: "modelrun" | "probe" | "blind";
  /** umur run (jam). */
  ageH: number;
  /** frame terakhir sudah lewat → data belum diperbarui BMKG. */
  expired: boolean;
};
