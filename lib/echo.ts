// ---------------------------------------------------------------------------
// Deteksi hujan radar per KECAMATAN Kepulauan Riau dari piksel PNG MSS (server-side).
//
// Kenapa di server: header CORS MSS cuma mengizinkan www.weather.gov.sg, jadi canvas
// readback di browser diblokir. PNG-nya toh sudah ditarik server buat probe.
//
// Wilayah: DARATAN 52 kecamatan di Batam, Tanjungpinang, Bintan, Karimun, dan Lingga (batas
// Badan Informasi Geospasial edisi Juni 2026) → piksel radar lewat lib/kecamatan-mask.ts
// (dibangun scripts/build-kecamatan.mjs dari RADAR_BOUNDS yang sama; piksel pantai dihitung
// pecahan). Dulu kotak 45×45 km — separuhnya laut, sampai perairan Singapura.
//
// Kelas intensitas dari palet ASLI PNG MSS (disampel 32 warna, 2026-09-26):
//   r == 0            → cyan/teal/hijau  = "ringan"   (MSS: Light)
//   r > 0 && g >= 128 → kuning/oranye     = "sedang"   (MSS: Moderate)
//   r > 0 && g <  128 → merah/magenta     = "lebat"    (MSS: Heavy)
// Alpha 0 = tidak ada pantulan. Pantulan radar ≠ pasti hujan di tanah — Detail panel
// menjelaskannya ("perkiraan radar … bisa beda dengan yang kamu rasakan").
// ---------------------------------------------------------------------------
import { PNG } from "pngjs";
import { inScope, kecLevel, kecRainy, levelRank, type KecEcho, type RainLevel, type RainScope } from "./kecamatan";
import { KEC_MASK, KEC_MASK_BOUNDS, KEC_MASK_SIZE } from "./kecamatan-mask";
import { RADAR_BOUNDS } from "./radar";

export type EchoLevel = RainLevel;
/** Ringkasan satu cakupan (Kota Batam, atau semua kab/kota Kepri dalam jangkauan). */
export type ScopeStats = {
  /** ada kecamatan yang hujan (≥ KEC_RAIN_MIN_KM2 di daratannya) */
  near: boolean;
  /** fraksi daratan cakupan yang terkena pantulan, 0–1 */
  coverage: number;
  /** kelas tertinggi di antara kecamatan yang hujan; null kalau tidak ada */
  level: EchoLevel | null;
  /** km² per kelas di seluruh daratan cakupan */
  byClass: { ringan: number; sedang: number; lebat: number };
  landKm2: number;
};
/** Kota Batam di akar (kompatibel dengan respons lama) + semua kecamatan + ringkasan Kepri. */
export type EchoStats = ScopeStats & { kec: KecEcho[]; region: ScopeStats };

const r1 = (v: number) => Math.round(v * 10) / 10;
const sameBounds = JSON.stringify(KEC_MASK_BOUNDS) === JSON.stringify(RADAR_BOUNDS);

function summarize(kec: KecEcho[], scope: RainScope): ScopeStats {
  const list = kec.filter((k) => inScope(k, scope));
  let land = 0;
  const byClass = { ringan: 0, sedang: 0, lebat: 0 };
  let level: EchoLevel | null = null;
  for (const k of list) {
    land += k.land;
    byClass.ringan += k.ringan;
    byClass.sedang += k.sedang;
    byClass.lebat += k.lebat;
    const l = kecLevel(k);
    if (levelRank(l) > levelRank(level)) level = l;
  }
  const rain = byClass.ringan + byClass.sedang + byClass.lebat;
  return {
    near: list.some(kecRainy),
    coverage: land > 0 ? rain / land : 0,
    level,
    byClass: { ringan: r1(byClass.ringan), sedang: r1(byClass.sedang), lebat: r1(byClass.lebat) },
    landKm2: r1(land),
  };
}

/** Hitung hujan per kecamatan dari buffer PNG radar. Lempar kalau PNG rusak / masker tak cocok. */
export function batamStats(png: Buffer): EchoStats {
  // Masker dibangun untuk RADAR_BOUNDS & ukuran 480×480; kalau salah satunya berubah,
  // hitungan per kecamatan jadi ngawur → lebih baik gagal (UI: "Deteksi Hujan Gagal").
  if (!sameBounds) throw new Error("kecamatan-mask: RADAR_BOUNDS berubah, jalankan scripts/build-kecamatan.mjs");
  const img = PNG.sync.read(png);
  if (img.width !== KEC_MASK_SIZE.w || img.height !== KEC_MASK_SIZE.h) {
    throw new Error(`kecamatan-mask: ukuran PNG ${img.width}×${img.height} ≠ ${KEC_MASK_SIZE.w}×${KEC_MASK_SIZE.h}`);
  }
  const sub2 = KEC_MASK_SIZE.sub2;
  const kec: KecEcho[] = KEC_MASK.map((m) => {
    let ringan = 0;
    let sedang = 0;
    let lebat = 0;
    for (let n = 0; n < m.idx.length; n++) {
      const i = m.idx[n] * 4;
      if (img.data[i + 3] === 0) continue;
      const w = m.w[n] / sub2;
      const r = img.data[i];
      const g = img.data[i + 1];
      if (r === 0) ringan += w;
      else if (g >= 128) sedang += w;
      else lebat += w;
    }
    return {
      code: m.code,
      name: m.name,
      kab: m.kab,
      land: m.landKm2,
      rain: r1(ringan + sedang + lebat),
      ringan: r1(ringan),
      sedang: r1(sedang),
      lebat: r1(lebat),
    };
  });
  return { ...summarize(kec, "batam"), kec, region: summarize(kec, "kepri") };
}
