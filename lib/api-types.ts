// Bentuk respons route handler — DIPAKAI BERSAMA server (anotasi tipe) & klien (import),
// biar field nggak "disalin tangan" lalu diam-diam beda.
import type { Frame } from "./radar";

export type FramesResponse = {
  frames: Frame[];
  count: number;
  /** MSS nggak nerbitin apa-apa (atau frame terbaru > 18 mnt). */
  stale: boolean;
  /** umur frame terbaru (menit) saat respons dibuat; null kalau frames kosong. */
  ageMinutes: number | null;
  /** "mss" = probe nemu file; "lastGood" = pakai hasil probe sebelumnya (≤3 jam); "none" = nihil. */
  source: "mss" | "lastGood" | "none";
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
