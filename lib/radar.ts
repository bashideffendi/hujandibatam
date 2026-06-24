// ---------------------------------------------------------------------------
// Konfigurasi radar hujan MSS (Meteorological Service Singapore) — jangkauan 240 km.
//
// Gambar radar: PNG transparan 480x480 px, update tiap 15 menit.
// Pola URL: https://www.weather.gov.sg/files/rainarea/240km/dpsri_240km_<YYYYMMDDHHMM>0000dBR.dpsri.png
// Timestamp di nama file pakai jam Singapura (SGT = WIB + 1 jam).
// ---------------------------------------------------------------------------

export type Frame = {
  url: string; // URL PNG radar
  ts: string; // timestamp SGT mentah, "YYYYMMDDHHMM"
  time: string; // jam WIB siap-tampil, mis. "22.15"
  date: string; // tanggal WIB siap-tampil, mis. "Sabtu, 13 Juni"
};

export type ThemeMode = "light" | "dark";
export type ViewKey = "batam" | "regional" | "kepri" | "natuna";

// Leaflet butuh bounds [[south, west], [north, east]] = [[lat_min,lng_min],[lat_max,lng_max]].
//
// CATATAN KALIBRASI (diperbarui 2026-06-13 via workflow registrasi citra):
// MSS nggak publish bbox 240 km. Angka ini DITURUNKAN dengan georeferensi basemap
// resmi MSS sendiri (240km-v2.jpg) — diregistrasi ke basemap 50 km yang bounds-nya
// presisi, plus bukti kuat: citra 240 km = paruh-tengah konsentris dari citra 480 km
// (skala tepat 0.500). Hasil: berpusat ~(1.350 N, 103.95 E) ≈ radar Changi, span ~4.0°
// (~446 km, ~0.93 km/px). Confidence MEDIUM — center solid ~3 km, span ±~0.2°.
// Lock presisi tinggi: georeferensi 240km-v2.jpg (ada garis pantai) vs OSM lalu baca sudutnya.
export const RADAR_BOUNDS: [[number, number], [number, number]] = [
  [-0.66, 101.95], // SW (lat_min, lng_min)
  [3.36, 105.95], // NE (lat_max, lng_max)
];

// Batas geser peta supaya nggak nyasar keluar jangkauan radar.
export const MAX_BOUNDS: [[number, number], [number, number]] = RADAR_BOUNDS;
export const MIN_ZOOM = 7;
export const MAX_ZOOM = 12; // dikunci: lebih dari ini radar (1 km/px) mulai pecah

// 3 preset view — pakai bounding box wilayah asli (bukan center/zoom tebakan).
// bounds = [[south, west], [north, east]].
//  - batam: Pulau Batam (Sekupang–Nongsa–Nagoya–pesisir selatan)
//  - regional: cakupan radar regional (Singapura–Johor–Riau)
//  - kepri: klaster Kepri ber-radar (Karimun–Batam–Bintan/Tg.Pinang–Lingga)
export const VIEWS: Record<
  ViewKey,
  { label: string; sub: string; bounds: [[number, number], [number, number]] }
> = {
  batam: { label: "Kota Batam", sub: "fokus", bounds: [[0.98, 103.9], [1.19, 104.16]] },
  regional: { label: "Regional", sub: "240 km", bounds: [[-0.4, 102.4], [2.7, 105.3]] },
  kepri: { label: "Kepri", sub: "provinsi", bounds: [[0.1, 103.25], [1.28, 104.75]] },
  // Khusus mode OMBAK: mundur ke timur-laut biar Anambas + Natuna (Utara) keliatan.
  // Radar hujan nggak nyampe sini, jadi view ini cuma muncul di mode OMBAK.
  natuna: { label: "Natuna", sub: "laut lepas", bounds: [[-1.4, 102.6], [4.8, 108.2]] },
};
export const DEFAULT_VIEW: ViewKey = "batam";

// Sisihkan ruang buat chrome saat fit: atas = topbar, bawah = panel kontrol.
// Format Leaflet Point [x, y] (px).
export const VIEW_PADDING = {
  paddingTopLeft: [14, 76] as [number, number],
  paddingBottomRight: [14, 238] as [number, number],
};

// Basemap per tema (CARTO) — minimalis biar radar pop & kesan elegant.
export const TILES: Record<ThemeMode, string> = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", // Positron
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", // Dark Matter
};

// Penanda kota buat orientasi.
export const PLACES: { name: string; lat: number; lng: number }[] = [
  { name: "Singapura", lat: 1.29, lng: 103.85 },
  { name: "Batam", lat: 1.105, lng: 104.045 },
  { name: "Tg. Pinang", lat: 0.918, lng: 104.456 },
  { name: "Tg. Balai Karimun", lat: 1.0, lng: 103.43 },
  { name: "Lingga", lat: -0.2, lng: 104.6 },
];

// Skala warna intensitas hujan radar MSS (ringan → sangat lebat).
export const LEGEND: string[] = [
  "#6fb7e8",
  "#41ab5d",
  "#fed976",
  "#fd8d3c",
  "#e31a1c",
  "#7a0177",
];

// Tema default berdasar jam WIB (06.00–18.00 = terang). Dipakai client-side saja.
export function timeBasedTheme(): ThemeMode {
  const wibHour = (new Date().getUTCHours() + 7) % 24;
  return wibHour >= 6 && wibHour < 18 ? "light" : "dark";
}

// ---------------------------------------------------------------------------
// Mode OMBAK: choropleth gelombang per-area perairan BMKG (toggle HUJAN/OMBAK).
// ---------------------------------------------------------------------------
export type Mode = "hujan" | "ombak";

// 4 periode prakiraan BMKG (key overview gelombang.json → label tampil).
export const WAVE_PERIODS = [
  { key: "today", label: "Hari ini" },
  { key: "tomorrow", label: "Besok" },
  { key: "h2", label: "Lusa" },
  { key: "h3", label: "3 hari lagi" },
] as const;

// 7 kategori tinggi gelombang BMKG (urut rendah → ekstrem) + rentang meter.
export const WAVE_CATS = [
  "Tenang", "Rendah", "Sedang", "Tinggi", "Sangat Tinggi", "Ekstrem", "Sangat Ekstrem",
] as const;

export const WAVE_RANGE: Record<string, string> = {
  Tenang: "0–0,5 m",
  Rendah: "0,5–1,25 m",
  Sedang: "1,25–2,5 m",
  Tinggi: "2,5–4 m",
  "Sangat Tinggi": "4–6 m",
  Ekstrem: "6–9 m",
  "Sangat Ekstrem": ">9 m",
};

// Warna isi per tema. Light = di atas basemap terang; dark = LEBIH terang biar
// kategori parah tetap kebaca di basemap near-black (Dark Matter), bukan tenggelam.
export const WAVE_FILL: Record<ThemeMode, Record<string, string>> = {
  light: {
    Tenang: "#5dcaa5", Rendah: "#97c459", Sedang: "#efb528", Tinggi: "#e8852f",
    "Sangat Tinggi": "#dc3545", Ekstrem: "#a31d52", "Sangat Ekstrem": "#6a0f3a",
  },
  dark: {
    Tenang: "#4fc3a0", Rendah: "#9ed158", Sedang: "#f2bf3f", Tinggi: "#f08a44",
    "Sangat Tinggi": "#ee5566", Ekstrem: "#d4548a", "Sangat Ekstrem": "#b85ba0",
  },
};
export const WAVE_FILL_FALLBACK = "#94a3b8"; // area tak terjoin → abu, tetap render

// Garis batas area: hairline gelap di tema terang, terang di tema gelap, biar area
// bersebelahan warna mirip tetap kepisah (cue non-warna, bukan andalkan fill doang).
export const WAVE_BORDER: Record<ThemeMode, string> = {
  light: "rgba(20, 24, 33, 0.42)",
  dark: "rgba(255, 255, 255, 0.46)",
};

// Label periode RELATIF ke periode yg nutupin jam-sekarang (nowIndex). Penting: key
// overview (today/tomorrow/…) itu relatif WAKTU TERBIT BMKG, bukan tanggal absolut —
// jadi periode di nowIndex HARUS dibaca "Hari ini" (offset 0), bukan label tetap.
export function wavePeriodLabel(index: number, nowIndex: number): string {
  const o = index - nowIndex;
  if (o === 0) return "Hari ini";
  if (o === 1) return "Besok";
  if (o === 2) return "Lusa";
  if (o === -1) return "Kemarin";
  if (o < 0) return `${-o} hari lalu`;
  return `${o} hari`;
}

// Normalisasi string kategori BMKG → key kanonik (cek "sangat …" SEBELUM yg polos).
export function normCat(s: string): string | null {
  const c = (s || "").toLowerCase().trim();
  if (c.includes("sangat ekstrem")) return "Sangat Ekstrem";
  if (c.includes("ekstrem")) return "Ekstrem";
  if (c.includes("sangat tinggi")) return "Sangat Tinggi";
  if (c.includes("tinggi")) return "Tinggi";
  if (c.includes("sedang")) return "Sedang";
  if (c.includes("rendah")) return "Rendah";
  if (c.includes("tenang")) return "Tenang";
  return null;
}
