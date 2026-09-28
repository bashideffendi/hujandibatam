// ---------------------------------------------------------------------------
// Konfigurasi radar hujan MSS (Meteorological Service Singapore) — jangkauan 240 km.
//
// Gambar radar: PNG transparan 480x480 px, TERBIT tiap 5 menit (jeda terbit ~8 menit).
// Pola URL: <MSS_FILE_BASE>/dpsri_240km_<YYYYMMDDHHMM>0000dBR.dpsri.png
// Timestamp di nama file pakai jam Singapura (SGT = WIB + 1 jam).
// ---------------------------------------------------------------------------
import { CARTO_SUBDOMAINS, cartoTile, ofsTilePath } from "./sources";

export type Frame = {
  url: string; // URL PNG radar
  ts: string; // timestamp SGT mentah, "YYYYMMDDHHMM"
  time: string; // jam WIB siap-tampil, mis. "22.15"
  date: string; // tanggal WIB siap-tampil, mis. "Sabtu, 13 Juni"
};

export type ThemeMode = "light" | "dark";
export type ViewKey = "batam" | "regional" | "kepri" | "natuna" | "kamera";
// Mode tampilan: HUJAN (radar) · OMBAK (field gelombang OFS BMKG) · CCTV (kamera Batam).
export type Mode = "hujan" | "ombak" | "cctv";

// Leaflet butuh bounds [[south, west], [north, east]].
//
// KALIBRASI (diperbarui 2026-09-26, audit ronde 2):
// MSS nggak publish bbox. Citra 240 km = 480×480 px dan produknya memang 480 km
// (radius 240 km) → TEPAT 1 km/px. Georeferensi basemap resmi MSS ke 9 pulau OSM
// (RMS 0,76 km, kontrol Tanjung Piai + tepi Singapura) memberi bbox
// W 101.782 / E 106.146 / S -0.811 / N 3.524, pusat 1.356 N 103.964 E (≈ radar Changi).
// Nilai LAMA [[-0.66,101.95],[3.36,105.95]] (span 4,0° ≈ 446 km, 0,93 km/px) ternyata
// 8% terlalu sempit: echo di Batam bergeser ~3 km, di Tg. Pinang ~7 km ke arah Changi.
// Confidence HIGH (dua metode independen + skala bulat 1 km/px).
export const RADAR_BOUNDS: [[number, number], [number, number]] = [
  [-0.811, 101.782], // SW (lat_min, lng_min)
  [3.524, 106.146], // NE (lat_max, lng_max)
];
/** Resolusi nominal citra radar — dipakai di keterangan legend. */
export const RADAR_KM_PER_PX = 1;

export const MIN_ZOOM = 7;
export const MAX_ZOOM = 12; // dikunci: lebih dari ini radar (1 km/px) mulai pecah
// Mode CCTV nggak punya overlay radar, jadi batas 12 di atas nggak relevan di sana.
// Di zoom 17 semua pin sudah terpisah (kipas layar 24 px, jarak minimum ±45 px) —
// lebih dalam dari itu tidak ada gunanya.
export const CCTV_MAX_ZOOM = 17;
// Mode OMBAK: boleh zoom-out lebih jauh (nggak ada radar yang pecah) biar laut jauh keliatan.
export const OMBAK_MIN_ZOOM = 5;

// Preset view — bounding box wilayah asli (bukan center/zoom tebakan). Label dipakai
// apa adanya di tombol "Wilayah Peta".
export const VIEWS: Record<ViewKey, { label: string; bounds: [[number, number], [number, number]] }> = {
  // Pulau Batam + Belakang Padang + ujung Rempang: HP dibuka z10, laptop z11.
  batam: { label: "Batam", bounds: [[0.96, 103.84], [1.21, 104.2]] },
  regional: { label: "Luas", bounds: [[-0.4, 102.4], [2.7, 105.3]] },
  // Batam, Tanjungpinang, Bintan, Karimun, dan pulau utama Lingga (kab/kota dalam jangkauan radar).
  kepri: { label: "Kepri", bounds: [[-0.6, 103.25], [1.3, 104.85]] },
  // Khusus mode OMBAK: mundur ke timur-laut biar Anambas + Natuna keliatan.
  natuna: { label: "Natuna", bounds: [[-1.4, 102.6], [4.8, 108.2]] },
  // Khusus mode CCTV: kotak 28 kamera (1,0346–1,1668 LU, 103,928–104,132 BT) + margin
  // ±0,005°. Lebarnya ±312 px di zoom 11 → HP 360/375 px dibuka di z11 (kelompok maks 8),
  // bukan z10 (kelompok 18–21) seperti saat masih memakai view "batam".
  kamera: { label: "Kamera", bounds: [[1.03, 103.923], [1.172, 104.137]] },
};
export const DEFAULT_VIEW: ViewKey = "batam";
export const VIEW_KEYS: Record<Mode, ViewKey[]> = {
  hujan: ["batam", "kepri", "regional"],
  ombak: ["batam", "kepri", "regional", "natuna"],
  cctv: ["kamera"],
};
/** View bawaan per mode (CCTV selalu kotak kamera). */
export const defaultViewFor = (mode: Mode): ViewKey => (mode === "cctv" ? "kamera" : DEFAULT_VIEW);

// CARTO basemap raster WAJIB API key sejak 2026-09 (tanpa key → watermark "API KEY
// REQUIRED"). Key di env NEXT_PUBLIC_CARTO_KEY (repo PUBLIC → JANGAN hardcode).
// Key ini ketarik browser jadi memang KELIHATAN di client; yang membatasi penyalah-
// gunaan cuma restriksi Referer di dashboard CARTO — Referer bisa dipalsukan dari
// skrip, jadi anggap ini pagar rendah: nyalakan alert pemakaian di dashboard, dan
// key bisa diganti kapan saja lewat env Vercel. Gratis s/d 5 juta tile/bulan.
export const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY
  ? `?key=${process.env.NEXT_PUBLIC_CARTO_KEY}`
  : "";

// Basemap per tema (CARTO) — minimalis biar radar pop & kesan elegant.
export const TILES: Record<ThemeMode, string> = {
  light: cartoTile("light_all", CARTO_KEY), // Positron
  dark: cartoTile("dark_all", CARTO_KEY), // Dark Matter
};
/** Label saja (dipasang DI ATAS mask darat di mode OMBAK). */
export const LABEL_TILES: Record<ThemeMode, string> = {
  light: cartoTile("light_only_labels", CARTO_KEY),
  dark: cartoTile("dark_only_labels", CARTO_KEY),
};
export { CARTO_SUBDOMAINS };

// Penanda kota buat orientasi (mode HUJAN saja). Batam tak perlu: sudah ada label kecamatan.
export const PLACES: { name: string; lat: number; lng: number }[] = [
  { name: "Singapura", lat: 1.29, lng: 103.85 },
  { name: "Tg. Pinang", lat: 0.918, lng: 104.456 },
  { name: "Tg. Balai Karimun", lat: 1.0, lng: 103.43 },
  { name: "Lingga", lat: -0.2, lng: 104.6 },
];

// Skala warna intensitas hujan — DISAMPEL dari PNG radar MSS asli (2026-09-26, 32 warna):
// cyan → teal → hijau → kuning → oranye → merah → magenta. Legend resmi MSS cuma
// tiga tingkat: Light (cyan) · Moderate (kuning) · Heavy (magenta) — nggak ada "ekstrem".
export const LEGEND: string[] = [
  "#00ffff",
  "#00babf",
  "#008045",
  "#00ff00",
  "#ffff00",
  "#ffa500",
  "#ff4900",
  "#e50000",
  "#d200a5",
];
export const LEGEND_LABELS = ["Ringan", "Sedang", "Lebat"] as const;

// Tema default berdasar jam WIB (06.00–18.00 = terang). Dipakai client-side saja.
export function timeBasedTheme(): ThemeMode {
  const wibHour = (new Date().getUTCHours() + 7) % 24;
  return wibHour >= 6 && wibHour < 18 ? "light" : "dark";
}

// "YYYYMMDDHHMM" (SGT) → instant UTC (ms). SGT = UTC+8.
export function tsToInstant(ts: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 8 * 3600 * 1000;
}
/** Umur frame (menit) dihitung di klien — tetap benar walau respons API ke-cache sebentar. */
export function ageMinutesOf(ts: string, now = Date.now()): number | null {
  const t = tsToInstant(ts);
  return t === null ? null : Math.max(0, Math.round((now - t) / 60000));
}

// ---------------------------------------------------------------------------
// OFS BMKG: field gelombang KONTINU (WAVEWATCH III hi-res "w3g_hires", param swh =
// significant wave height) sebagai TMS tile pre-colored → mulus, nol-lubang.
// ---------------------------------------------------------------------------
export const OFS_TILE = (baserun: string, valid: string) =>
  ofsTilePath(baserun, valid, "{z}", "{x}", "{y}");

// Colormap swh resmi BMKG (14 stop, ambang-bawah meter → warna). Peta contourf
// mengisi tiap BAND dengan SATU warna (diskret) — legend harus hard-stop, bukan gradien.
export const OFS_SWH_COLORS: { m: number; c: string }[] = [
  { m: 0, c: "#075de6" }, { m: 0.5, c: "#3175bc" }, { m: 0.75, c: "#5bbee7" },
  { m: 1, c: "#01fbbc" }, { m: 1.25, c: "#01d743" }, { m: 1.5, c: "#fffb52" },
  { m: 2, c: "#ffab31" }, { m: 2.5, c: "#ff7d29" }, { m: 3, c: "#9c4510" },
  { m: 3.5, c: "#e7453a" }, { m: 4, c: "#c72c32" }, { m: 5, c: "#e734c6" },
  { m: 6, c: "#b5349b" }, { m: 7, c: "#691d77" },
];
export const OFS_MAX_M = 7;
// Kategori resmi BMKG (meter) buat baris di bawah legend.
export const OFS_CATEGORIES: { label: string; from: number; to: number }[] = [
  { label: "Tenang", from: 0, to: 0.5 },
  { label: "Rendah", from: 0.5, to: 1.25 },
  { label: "Sedang", from: 1.25, to: 2.5 },
  { label: "Tinggi", from: 2.5, to: 4 },
  { label: "Sangat Tinggi", from: 4, to: 6 },
  { label: "Ekstrem", from: 6, to: 7 },
];

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
// "202606241500" (UTC) → { time:"22.00", day:"Rab", date:"Rab, 24 Jun" } WIB (+7 jam).
export function ofsValidWib(valid: string): { time: string; day: string; date: string } {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(valid);
  if (!m) return { time: "—", day: "", date: "" };
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    time: `${p(d.getUTCHours())}.${p(d.getUTCMinutes())}`,
    day: HARI[d.getUTCDay()],
    date: `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`,
  };
}
