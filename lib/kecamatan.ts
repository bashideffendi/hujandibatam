// ---------------------------------------------------------------------------
// Aturan hujan per kecamatan Kepulauan Riau — fungsi murni, dipakai BERSAMA server
// (lib/echo.ts, pencarian "terakhir hujan") dan klien (lib/status.ts) supaya keduanya tak
// pernah beda.
//
// Dasar hitungan: piksel radar MSS (1 px ≈ 1 km²) yang jatuh di DARATAN tiap kecamatan
// (batas Badan Informasi Geospasial edisi Juni 2026, lib/kecamatan-mask.ts). Hujan di laut
// tidak dihitung. Hanya kecamatan yang ≥90% daratannya terjangkau radar yang ikut (Natuna,
// Anambas, Tambelan di luar jangkauan).
// ---------------------------------------------------------------------------

export type RainLevel = "ringan" | "sedang" | "lebat";

/** Kab/kota dalam jangkauan radar, urut tampil (Batam dulu). */
export const KAB_ORDER = ["Batam", "Tanjungpinang", "Bintan", "Karimun", "Lingga"] as const;
export const KOTA_UTAMA = "Batam";

/** Luas (km², 1 desimal) di daratan satu kecamatan pada citra radar terbaru. */
export type KecEcho = {
  /** kode wilayah Kemendagri, mis. "21.71.03" */
  code: string;
  name: string;
  /** kab/kota singkat: "Batam", "Tanjungpinang", "Bintan", "Karimun", "Lingga" */
  kab: string;
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
 * cukup ±3 km², Galang atau Lingga yang ratusan km² perlu 10 km². Kalau tak ada, turun kelas.
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

/** Cakupan jawaban: Kota Batam saja, atau semua kab/kota Kepri dalam jangkauan radar. */
export type RainScope = "batam" | "kepri";
export const inScope = (k: { kab: string }, scope: RainScope) => scope === "kepri" || k.kab === KOTA_UTAMA;
export const kabRank = (kab: string) => {
  const i = (KAB_ORDER as readonly string[]).indexOf(kab);
  return i < 0 ? 99 : i;
};
