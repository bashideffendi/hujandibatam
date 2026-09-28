// ---------------------------------------------------------------------------
// Deteksi hujan radar di SEKITAR BATAM dari piksel PNG MSS (server-side).
//
// Kenapa di server: header CORS MSS cuma mengizinkan www.weather.gov.sg, jadi canvas
// readback di browser diblokir. PNG-nya toh sudah ditarik server buat probe.
//
// Kotak: BATAM_BOX (lib/radar.ts, ≈45×45 km) → dipetakan ke piksel lewat RADAR_BOUNDS
// (480 px = 480 km, 1 km/px; kalau bounds salah, kotaknya ikut salah — makanya
// diturunkan dari konstanta yang sama, bukan angka piksel hardcode).
//
// Kelas intensitas dari palet ASLI PNG MSS (disampel 32 warna, 2026-09-26):
//   r == 0            → cyan/teal/hijau  = "ringan"   (MSS: Light)
//   r > 0 && g >= 128 → kuning/oranye     = "sedang"   (MSS: Moderate)
//   r > 0 && g <  128 → merah/magenta     = "lebat"    (MSS: Heavy)
// Alpha 0 = tidak ada pantulan. Pantulan radar ≠ pasti hujan di tanah — Detail panel
// menjelaskannya ("perkiraan radar … bisa beda dengan yang kamu rasakan").
// ---------------------------------------------------------------------------
import { PNG } from "pngjs";
import { BATAM_BOX, RADAR_BOUNDS } from "./radar";

export type EchoLevel = "ringan" | "sedang" | "lebat";
export type EchoByClass = { ringan: number; sedang: number; lebat: number };
export type EchoStats = {
  /** ada pantulan berarti (≥ MIN_PX piksel) di kotak Batam */
  near: boolean;
  /** fraksi kotak yang terisi pantulan, 0–1 */
  coverage: number;
  /** kelas tertinggi yang mencapai MIN_PX piksel; null kalau tidak ada */
  level: EchoLevel | null;
  px: number;
  /** jumlah piksel per kelas (1 px ≈ 1 km²) — klien menurunkan kelas yang cuma beberapa piksel */
  byClass: EchoByClass;
  /** luas kotak dalam piksel */
  boxPx: number;
};

const MIN_PX = 3; // di bawah ini dianggap noise

function boxPixels(width: number, height: number) {
  const [[S, W], [N, E]] = RADAR_BOUNDS;
  const px = (lng: number) => ((lng - W) / (E - W)) * width;
  const py = (lat: number) => ((N - lat) / (N - S)) * height;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.floor(v)));
  return {
    x0: clamp(px(BATAM_BOX.w), width),
    x1: clamp(px(BATAM_BOX.e), width),
    y0: clamp(py(BATAM_BOX.n), height),
    y1: clamp(py(BATAM_BOX.s), height),
  };
}

/** Hitung statistik pantulan kotak Batam dari buffer PNG radar. Lempar kalau PNG rusak. */
export function batamBoxStats(png: Buffer): EchoStats {
  const img = PNG.sync.read(png);
  const { x0, x1, y0, y1 } = boxPixels(img.width, img.height);
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  let total = 0;
  let ringan = 0;
  let sedang = 0;
  let lebat = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] === 0) continue;
      total++;
      const r = img.data[i];
      const g = img.data[i + 1];
      if (r === 0) ringan++;
      else if (g >= 128) sedang++;
      else lebat++;
    }
  }
  const level: EchoLevel | null =
    lebat >= MIN_PX ? "lebat" : sedang >= MIN_PX ? "sedang" : total >= MIN_PX ? "ringan" : null;
  return {
    near: total >= MIN_PX,
    coverage: total / area,
    level,
    px: total,
    byClass: { ringan, sedang, lebat },
    boxPx: area,
  };
}
