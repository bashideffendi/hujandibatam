// ---------------------------------------------------------------------------
// SATU tempat untuk semua host/URL eksternal (tanpa secret). Kalau sumber pindah
// host (BMKG pernah: peta-maritim → maritim, 2026-09), cukup ubah di sini —
// probe di server dan tile di klien dijamin pakai path yang SAMA.
// ---------------------------------------------------------------------------

export const SITE_URL = "https://hujandibatam.masbash.id";

// MSS (Meteorological Service Singapore) — citra radar 240 km, PNG per 5 menit.
export const MSS_FILE_BASE = "https://www.weather.gov.sg/files/rainarea/240km";
export const MSS_HOST = "https://www.weather.gov.sg";

// NEA (National Environment Agency, Singapura) lewat data.gov.sg.
// v1 masih hidup (dicek 2026-09-26, tanpa header deprecation); angin & nowcast di v2.
export const NEA = {
  psi: "https://api.data.gov.sg/v1/environment/psi",
  uv: "https://api.data.gov.sg/v1/environment/uv-index",
  rain: "https://api.data.gov.sg/v1/environment/rainfall",
  windSpeed: "https://api-open.data.gov.sg/v2/real-time/api/wind-speed",
  windDir: "https://api-open.data.gov.sg/v2/real-time/api/wind-direction",
  nowcast: "https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast",
} as const;

// BMKG OFS (Ocean Forecast System). Host LAMA peta-maritim.bmkg.go.id sekarang
// 301 → maritim.bmkg.go.id (dicek 2026-09-26) — pakai host baru langsung supaya
// tiap tile nggak bayar satu round-trip redirect.
export const OFS_HOST = "https://maritim.bmkg.go.id";
export const OFS_MODELRUN = `${OFS_HOST}/api21/modelrun`;
export const OFS_REFERER = `${OFS_HOST}/ofs`;
/**
 * Prakiraan perairan "Perairan Kep. Batam" (P.R.02) + peringatan dini gelombang per provinsi,
 * API maritim BMKG baru marine2026-data (dok: maritim.bmkg.go.id/apidoc). Jalur lama
 * public_api/perairan/E.02.json sudah 404 (dicek 29 Sep 2026).
 */
export const OFS_PERAIRAN = `${OFS_HOST}/marine2026-data/perairan/P.R.02.json`;
export const OFS_WARNINGS = `${OFS_HOST}/marine2026-data/warning/warnings.json`;
/** Template tile TMS (y-flip) pre-colored contourf swh. z/x/y boleh angka atau placeholder Leaflet. */
export const ofsTilePath = (
  baserun: string,
  valid: string,
  z: number | string,
  x: number | string,
  y: number | string,
) =>
  `${OFS_HOST}/api21/mpl_req/w3g_hires/swh/0/${baserun}/${valid}/${z}/${x}/${y}.png?ci=1&overlays=,contourf&conc=snow`;

// BMKG prakiraan cuaca per kelurahan (kode wilayah tingkat IV). 21.71.10.1003 = Teluk
// Tering, Kec. Batam Kota (Batam Center) — dipakai sebagai wakil pusat kota. CORS *, tapi
// app menariknya lewat server (lihat app/api/prakiraan).
export const BMKG_FORECAST = "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=21.71.10.1003";
export const BMKG_FORECAST_PLACE = "Batam Kota";

// CARTO raster basemap (wajib ?key= sejak 2026-09; key di env, lihat lib/radar.ts).
export const CARTO_SUBDOMAINS = ["a", "b", "c", "d"];
export const cartoTile = (style: string, keyQuery: string) =>
  `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png${keyQuery}`;
export const CARTO_PRECONNECT = ["https://a.basemaps.cartocdn.com", "https://b.basemaps.cartocdn.com"];

// Vector-tile daratan (mask di mode OMBAK). Layer id "indocg", maxzoom 10, CORS *.
export const CIRCLEGEO_LAND = "https://tiles.circlegeo.com/data/indocg/{z}/{x}/{y}.pbf";
/** Tile z7 yang pasti berisi darat (Batam–Singapura–Johor) — dipakai sebagai sentinel. */
export const CIRCLEGEO_SENTINEL = "https://tiles.circlegeo.com/data/indocg/7/100/63.pbf";

// CCTV Pemko Batam (HLS publik). Hostname tetap kelihatan di tab Network — nggak bisa disembunyikan.
export const CCTV_HOST = "https://matanya.batam.go.id";
