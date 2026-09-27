// ---------------------------------------------------------------------------
// Deteksi echo radar di SEKITAR BATAM dari piksel PNG MSS (server-side).
//
// Kenapa di server: header CORS MSS cuma mengizinkan www.weather.gov.sg, jadi canvas
// readback di browser diblokir. PNG-nya toh sudah ditarik server buat probe.
//
// Kotak: Batam ±0,2° (≈ ±20 km) dari (1.10 N, 104.05 E) → dipetakan ke piksel lewat
// RADAR_BOUNDS (480 px = 480 km, 1 km/px; kalau bounds salah, kotaknya ikut salah —
// makanya diturunkan dari konstanta yang sama, bukan angka piksel hardcode).
//
// Kelas intensitas dari palet ASLI PNG MSS (disampel 32 warna, 2026-09-26):
//   r == 0            → cyan/teal/hijau  = "ringan"   (MSS: Light)
//   r > 0 && g >= 128 → kuning/oranye     = "sedang"   (MSS: Moderate)
//   r > 0 && g <  128 → merah/magenta     = "lebat"    (MSS: Heavy)
// Alpha 0 = tidak ada echo. "Echo" ≠ pasti hujan di tanah — copy UI wajib bilang "echo radar".
// ---------------------------------------------------------------------------
import { PNG } from "pngjs";
import { RADAR_BOUNDS } from "./radar";

export type EchoLevel = "ringan" | "sedang" | "lebat";
export type EchoStats = {
  /** ada echo berarti (≥ MIN_PX piksel) di kotak Batam */
  near: boolean;
  /** fraksi kotak yang ber-echo, 0–1 */
  coverage: number;
  /** kelas tertinggi yang mencapai MIN_PX piksel; null kalau tidak ada */
  level: EchoLevel | null;
  px: number;
};

export const BATAM_BOX = { s: 0.9, n: 1.3, w: 103.85, e: 104.25 } as const;
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

/** Hitung statistik echo kotak Batam dari buffer PNG radar. Lempar kalau PNG rusak. */
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
  return { near: total >= MIN_PX, coverage: total / area, level, px: total };
}
