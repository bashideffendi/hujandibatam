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
export type ViewKey = "batam" | "regional" | "kepri";

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
