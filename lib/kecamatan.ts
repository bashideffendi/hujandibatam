// ---------------------------------------------------------------------------
// Aturan hujan per kecamatan Kota Batam — fungsi murni, dipakai BERSAMA server (lib/echo.ts,
// pencarian "terakhir hujan") dan klien (lib/status.ts) supaya keduanya tak pernah beda.
//
// Dasar hitungan: piksel radar MSS (1 px ≈ 1 km²) yang jatuh di DARATAN tiap kecamatan
// (batas resmi Satu Data Kota Batam, lib/kecamatan-mask.ts). Hujan di laut tidak dihitung.
// ---------------------------------------------------------------------------

export type RainLevel = "ringan" | "sedang" | "lebat";

/** Luas (km², 1 desimal) di daratan satu kecamatan pada citra radar terbaru. */
export type KecEcho = {
  name: string;
  /** luas daratan kecamatan yang terpetakan ke piksel radar */
  land: number;
  /** luas daratan yang terkena pantulan hujan (semua kelas) */
  rain: number;
  ringan: number;
  sedang: number;
  lebat: number;
};

/** Kecamatan disebut hujan kalau luasnya ≥ ini. Bintik 1 piksel = noise radar. */
export const KEC_RAIN_MIN_KM2 = 2;

export const kecRainy = (k: KecEcho) => k.rain >= KEC_RAIN_MIN_KM2;

/**
 * Kelas hujan kecamatan: kelas tertinggi yang luasnya (dijumlah dari kelas itu ke atas)
 * ≥ ambang. Ambang = 25% daratan kecamatan, dibatasi 2–10 km² — jadi Lubuk Baja (11 km²)
 * cukup ±3 km², Galang (278 km²) perlu 10 km². Kalau tak ada, turun kelas.
 */
export function kecLevel(k: KecEcho): RainLevel | null {
  if (!kecRainy(k)) return null;
  const t = Math.min(10, Math.max(2, 0.25 * k.land));
  if (k.lebat >= t) return "lebat";
  if (k.lebat + k.sedang >= t) return "sedang";
  return "ringan";
}

const RANK: Record<RainLevel, number> = { ringan: 1, sedang: 2, lebat: 3 };
export const levelRank = (l: RainLevel | null) => (l ? RANK[l] : 0);

/** Kecamatan yang sedang hujan, terderas & terluas dulu. */
export function rainyKec(list: KecEcho[] | undefined): (KecEcho & { level: RainLevel })[] {
  return (list ?? [])
    .map((k) => ({ ...k, level: kecLevel(k) }))
    .filter((k): k is KecEcho & { level: RainLevel } => k.level !== null)
    .sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.rain - a.rain);
}

export const KEC_TOTAL = 12;
