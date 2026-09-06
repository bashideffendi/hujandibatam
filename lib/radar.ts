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

export const MIN_ZOOM = 7;
export const MAX_ZOOM = 12; // dikunci: lebih dari ini radar (1 km/px) mulai pecah
// Mode CCTV nggak punya overlay radar, jadi batas 12 di atas nggak relevan di sana.
// Perlu zoom dalam biar pin kamera yang berdempet (beberapa kamera satu simpang)
// bisa dipisah dan diklik satu-satu. Basemap CARTO sanggup sampai 20.
export const CCTV_MAX_ZOOM = 18;

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

// Mode tampilan: HUJAN (radar) · OMBAK (field gelombang OFS BMKG) · CCTV
// (kamera Batam sebagai verifikasi visual radar — lihat lib/cctv.ts).
export type Mode = "hujan" | "ombak" | "cctv";

// ---------------------------------------------------------------------------
// OFS BMKG: field gelombang KONTINU (WAVEWATCH III hi-res "w3g_hires", param swh =
// significant wave height) sebagai TMS tile pre-colored → mulus, nol-lubang.
// ---------------------------------------------------------------------------
// TMS tile (y-flip!) — host peta-maritim, path api21, pre-colored contourf.
export const OFS_TILE = (baserun: string, valid: string) =>
  `https://peta-maritim.bmkg.go.id/api21/mpl_req/w3g_hires/swh/0/${baserun}/${valid}/{z}/{x}/{y}.png?ci=1&overlays=,contourf&conc=snow`;

// Colormap swh resmi BMKG (14 stop, ambang-bawah meter → warna) — buat legend gradien.
export const OFS_SWH_COLORS: { m: number; c: string }[] = [
  { m: 0, c: "#075de6" }, { m: 0.5, c: "#3175bc" }, { m: 0.75, c: "#5bbee7" },
  { m: 1, c: "#01fbbc" }, { m: 1.25, c: "#01d743" }, { m: 1.5, c: "#fffb52" },
  { m: 2, c: "#ffab31" }, { m: 2.5, c: "#ff7d29" }, { m: 3, c: "#9c4510" },
  { m: 3.5, c: "#e7453a" }, { m: 4, c: "#c72c32" }, { m: 5, c: "#e734c6" },
  { m: 6, c: "#b5349b" }, { m: 7, c: "#691d77" },
];

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
// "202606241500" (UTC) → { time:"22.00", date:"Rab, 24 Jun" } WIB (+7 jam).
export function ofsValidWib(valid: string): { time: string; date: string } {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(valid);
  if (!m) return { time: "—", date: "" };
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    time: `${p(d.getUTCHours())}.${p(d.getUTCMinutes())}`,
    date: `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`,
  };
}
