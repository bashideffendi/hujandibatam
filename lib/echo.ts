// ---------------------------------------------------------------------------
// Deteksi hujan radar di KOTA BATAM, per kecamatan, dari piksel PNG MSS (server-side).
//
// Kenapa di server: header CORS MSS cuma mengizinkan www.weather.gov.sg, jadi canvas
// readback di browser diblokir. PNG-nya toh sudah ditarik server buat probe.
//
// Wilayah: DARATAN 12 kecamatan (batas resmi Satu Data Kota Batam) → piksel radar lewat
// lib/kecamatan-mask.ts (dibangun scripts/build-kecamatan.mjs dari RADAR_BOUNDS yang sama;
// piksel pantai dihitung pecahan). Dulu kotak 45×45 km — separuhnya laut, sampai perairan
// Singapura, jadi hujan di laut ikut disebut "hujan di Batam".
//
// Kelas intensitas dari palet ASLI PNG MSS (disampel 32 warna, 2026-09-26):
//   r == 0            → cyan/teal/hijau  = "ringan"   (MSS: Light)
//   r > 0 && g >= 128 → kuning/oranye     = "sedang"   (MSS: Moderate)
//   r > 0 && g <  128 → merah/magenta     = "lebat"    (MSS: Heavy)
// Alpha 0 = tidak ada pantulan. Pantulan radar ≠ pasti hujan di tanah — Detail panel
// menjelaskannya ("perkiraan radar … bisa beda dengan yang kamu rasakan").
// ---------------------------------------------------------------------------
import { PNG } from "pngjs";
import { kecLevel, kecRainy, levelRank, type KecEcho, type RainLevel } from "./kecamatan";
import { KEC_MASK, KEC_MASK_BOUNDS, KEC_MASK_SIZE } from "./kecamatan-mask";
import { RADAR_BOUNDS } from "./radar";

export type EchoLevel = RainLevel;
export type EchoStats = {
  /** ada kecamatan yang hujan (≥ KEC_RAIN_MIN_KM2 di daratannya) */
  near: boolean;
  /** fraksi daratan Kota Batam yang terkena pantulan, 0–1 */
  coverage: number;
  /** kelas tertinggi di antara kecamatan yang hujan; null kalau tidak ada */
  level: EchoLevel | null;
  /** km² per kelas di seluruh daratan Kota Batam */
  byClass: { ringan: number; sedang: number; lebat: number };
  landKm2: number;
  kec: KecEcho[];
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const sameBounds = JSON.stringify(KEC_MASK_BOUNDS) === JSON.stringify(RADAR_BOUNDS);

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
  const total = { ringan: 0, sedang: 0, lebat: 0 };
  let land = 0;
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
    total.ringan += ringan;
    total.sedang += sedang;
    total.lebat += lebat;
    land += m.landKm2;
    return {
      name: m.name,
      land: m.landKm2,
      rain: r1(ringan + sedang + lebat),
      ringan: r1(ringan),
      sedang: r1(sedang),
      lebat: r1(lebat),
    };
  });
  const rainTotal = total.ringan + total.sedang + total.lebat;
  const level = kec.reduce<EchoLevel | null>((best, k) => {
    const l = kecLevel(k);
    return levelRank(l) > levelRank(best) ? l : best;
  }, null);
  return {
    near: kec.some(kecRainy),
    coverage: land > 0 ? rainTotal / land : 0,
    level,
    byClass: { ringan: r1(total.ringan), sedang: r1(total.sedang), lebat: r1(total.lebat) },
    landKm2: r1(land),
    kec,
  };
}
