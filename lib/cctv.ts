// ---------------------------------------------------------------------------
// CCTV lalu lintas Kota Batam — 28 kamera, stream HLS publik tanpa autentikasi.
//
// KENAPA ADA DI SINI
// Semua layer lain di app ini (radar, PSI, angin, hujan, UV) adalah data
// SINGAPURA yang dipakai sebagai PROKSI buat Batam. Kamera ini satu-satunya
// sumber yang benar-benar merekam Batam — jadi fungsinya verifikasi: radar
// bilang ada echo di Batam Center, buka kamera, lihat jalannya basah atau nggak.
//
// DISIPLIN BANDWIDTH (jangan dilanggar)
// Satu segmen HLS ≈ 3 MB / 10 detik → ~2,4 Mbit/s, atau ~1 GB per jam per
// penonton. Yang nanggung server sumber, bukan server kita. Makanya:
//   - nggak ada grid, nggak ada autoplay, nggak ada prefetch SEGMEN video;
//   - boleh: SATU playlist teks (~250 B) kamera yang sedang dibuka, buat ngecek
//     kameranya hidup sebelum player narik video (lihat checkCam);
//   - cuma SATU stream hidup dalam satu waktu, dan cuma sesudah user klik pin;
//   - player wajib di-destroy pas ditutup + berhenti narik saat tab disembunyikan
//     (lihat components/CctvPlayer.tsx).
// Kalau nanti mau bikin mode "tembok kamera", jangan — itu bakal mukul server
// instansi yang nggak pernah setuju jadi CDN kita.
//
// ARMADA SERING MATI (dicek 2026-09-26: 13 hidup, 14 mati ENDLIST, 1 beku sejak Jun)
// Statusnya berubah-ubah (sambau1 mati 19 Sep, hidup lagi 26 Sep), jadi JANGAN
// di-hardcode — dicek saat kamera dibuka. Audit ulang: scripts/cctv-audit.sh.
//
// CATATAN KOORDINAT
// Sumbernya NGGAK menyediakan lat/lng sama sekali. Titik di bawah hasil
// geocoding sendiri (Nominatim + Overpass/OSM, 2026-09-07), BUKAN data resmi:
//   - precision "exact"  = ketemu POI bernama yang persis cocok;
//   - precision "approx" = jatuh ke titik acuan terdekat / centroid kelurahan,
//                          bisa meleset ratusan meter — ditandai di UI;
//   - dipastikan manual  = 3 titik yang nggak ada di OSM, dicek satu-satu di
//                          Google Maps (2026-09-07) lalu di-cross-check plus code
//                          vs koordinat hasil resolve tautan — cocok ~1 m.
// Beberapa kamera memang berbagi satu titik (dua kamera di simpang yang sama,
// beda arah hadap). Itu DISENGAJA — pin-nya dikipas otomatis pas render biar
// dua-duanya tetap bisa diklik; datanya tetap titik aslinya. Lihat CctvLayer.
// ---------------------------------------------------------------------------
import { CCTV_HOST } from "./sources";

export type Cam = {
  slug: string;
  name: string;
  /** kecamatan — dicocokkan dengan batas BIG edisi Juni 2026 (data/kecamatan-kepri.geojson) */
  area: string;
  lat?: number;
  lng?: number;
  /** true = titik acuan terdekat, bukan posisi kamera persis. */
  approx?: boolean;
};

/** Kredit sumber. Ganti/kosongkan di sini kalau kebijakannya berubah. */
export const CCTV_CREDIT = "CCTV Pemerintah Kota Batam";

export { CCTV_HOST };
export const streamUrl = (slug: string) => `${CCTV_HOST}/cctv/${slug}/stream.m3u8`;

/** Perkiraan konsumsi data siaran (3 MB / 10 dtk) — ditampilkan jujur ke pengguna. */
export const CCTV_MB_PER_MIN = 20;

export type CamCheck = {
  /**
   * ok     = playlist hidup & segar
   * mati   = playlist ditutup (#EXT-X-ENDLIST) — server berhenti menyiarkan
   * beku   = playlist tidak di-update > 10 menit (rekaman lama akan diputar sebagai "Langsung")
   * hilang = 404
   * server = 5xx (gangguan di server sumber; kamera belum tentu mati)
   * diam   = timeout / offline — TIDAK memvonis kamera
   */
  verdict: "ok" | "mati" | "beku" | "hilang" | "server" | "diam";
  /** Last-Modified playlist (ms epoch) kalau ada. */
  lastSeen: number | null;
};

const FROZEN_MS = 10 * 60 * 1000;

/**
 * Cek kesehatan kamera dari playlist-nya SEBELUM player menarik video: satu GET
 * ~250 B. Semua vonis di sini pasti (ENDLIST) atau pakai toleransi longgar
 * (Last-Modified vs jam HP, 10 menit) — kamera beku di data nyata tertinggal
 * berhari-hari sampai berbulan-bulan.
 */
export async function checkCam(slug: string, signal?: AbortSignal): Promise<CamCheck> {
  try {
    const res = await fetch(streamUrl(slug), { cache: "no-store", signal });
    if (res.status === 404) return { verdict: "hilang", lastSeen: null };
    if (res.status >= 500) return { verdict: "server", lastSeen: null };
    if (!res.ok) return { verdict: "diam", lastSeen: null };
    const text = await res.text();
    const lm = res.headers.get("last-modified");
    const parsed = lm ? Date.parse(lm) : NaN;
    const lastSeen = Number.isNaN(parsed) ? null : parsed;
    if (text.includes("#EXT-X-ENDLIST")) return { verdict: "mati", lastSeen };
    if (lastSeen !== null && Date.now() - lastSeen > FROZEN_MS) return { verdict: "beku", lastSeen };
    return { verdict: "ok", lastSeen };
  } catch {
    return { verdict: "diam", lastSeen: null };
  }
}

// hls.js build PENUH — JANGAN ganti ke "hls.js/light": build light membuang parser
// HEVC-dalam-MPEG-TS, padahal sebagian kamera Pemko menyiarkan H.265 (dicek 2026-09-27:
// dprd, southgate, madanipancuran, sukajadi2). Dengan build light, 4 kamera itu gagal
// total walau browsernya mendukung HEVC. Dimuat sekali, dibagi RadarMap (pemanasan
// saat masuk mode CCTV) dan CctvPlayer.
let hlsPromise: Promise<typeof import("hls.js")> | null = null;
export function loadHls() {
  hlsPromise ??= import("hls.js").catch((e) => {
    hlsPromise = null;
    throw e;
  });
  return hlsPromise;
}

export const CAMS: Cam[] = [
  // — Batam Kota / pusat pemerintahan —
  { slug: "atap", name: "Atap Kantor Wali Kota", area: "Batam Kota", lat: 1.127943, lng: 104.055197 },
  { slug: "dprd", name: "Depan Kantor DPRD", area: "Batam Kota", lat: 1.126903, lng: 104.055462 },
  { slug: "kejaksaanbi", name: "Simpang BI", area: "Batam Kota", lat: 1.128026, lng: 104.056966 },
  { slug: "southgate", name: "Gerbang Selatan Engku Putri", area: "Batam Kota", lat: 1.126500, lng: 104.054085, approx: true },
  { slug: "gerutara", name: "Gerbang Utara Engku Putri", area: "Batam Kota", lat: 1.129500, lng: 104.054085, approx: true },
  { slug: "madanipancuran", name: "Bundaran Madani Pancuran", area: "Batam Kota", lat: 1.133783, lng: 104.042511 },
  { slug: "madaniseipanas", name: "Bundaran Madani Arah Sei Panas", area: "Batam Kota", lat: 1.133783, lng: 104.042511, approx: true },
  { slug: "simpkuda1", name: "Simpang Kuda", area: "Batam Kota", lat: 1.136283, lng: 104.027114 },
  { slug: "sukajadi2", name: "Depan Perumahan Sukajadi", area: "Batam Kota", lat: 1.104559, lng: 104.026126, approx: true },
  { slug: "casablanca2", name: "Simpang Casablanca", area: "Batam Kota", lat: 1.121195, lng: 104.016326, approx: true },

  // — Lubuk Baja / Jodoh–Nagoya —
  { slug: "cobaan", name: "Nagoya Plaza", area: "Lubuk Baja", lat: 1.146140, lng: 104.010987 },
  { slug: "pasarjodoh2", name: "Depan Pasar Jodoh", area: "Batu Ampar", lat: 1.151230, lng: 104.005230 },

  // — Sekupang / Tiban —
  { slug: "sekupang", name: "Pelabuhan Sekupang", area: "Sekupang", lat: 1.126240, lng: 103.928415 },
  { slug: "seiladi2", name: "Simpang Sei Ladi", area: "Sekupang", lat: 1.108161, lng: 104.011206, approx: true },
  { slug: "pura1", name: "Depan Pura Sei Ladi", area: "Sekupang", lat: 1.108161, lng: 104.011206, approx: true },
  { slug: "matakucing1", name: "Mata Kucing", area: "Batu Aji", lat: 1.085136, lng: 103.971603, approx: true },
  // Titik = centroid perumahan Delta Villa (reverse-geocode), ±240 m dari jalan yang
  // difilmkan (Jl. Pangeran Diponegoro) → ditandai perkiraan (audit 2026-09).
  { slug: "delta2", name: "Depan Delta Villa Arah Mata Kucing", area: "Sekupang", lat: 1.102452, lng: 103.960683, approx: true },
  { slug: "southlink1", name: "Tanjakan Southlink", area: "Sekupang", lat: 1.113720, lng: 103.996030, approx: true },
  { slug: "ptzsouthlink", name: "Tanjakan Southlink (PTZ)", area: "Sekupang", lat: 1.114200, lng: 103.996030, approx: true },

  // — Batu Aji / Sagulung —
  { slug: "batuaji", name: "Depan SP Plaza Batu Aji", area: "Batu Aji", lat: 1.042239, lng: 103.982872 },

  // — Nongsa —
  // Titik dipastikan manual (2026-09-07). Dulu pakai centroid kelurahan Sambau
  // (1.154257, 104.100716) — meleset ~1,9 km. Dua kamera ini satu pertigaan.
  { slug: "sambau1", name: "Pertigaan Sambau 1", area: "Nongsa", lat: 1.166793, lng: 104.112627 },
  { slug: "sambau2", name: "Pertigaan Sambau 2", area: "Nongsa", lat: 1.166793, lng: 104.112627 },
  { slug: "punggur1", name: "Pelabuhan Punggur", area: "Nongsa", lat: 1.034618, lng: 104.132155 },

  // — Titik dipastikan manual lewat Google Maps (2026-09-07) —
  // Ketiganya nggak ketemu di Nominatim/Overpass, jadi diverifikasi di lapangan-peta.
  { slug: "engkuhamidah1", name: "Engku Hamidah", area: "Batam Kota", lat: 1.125114, lng: 104.026894 },
  { slug: "danganom1", name: "Taman Dang Anom", area: "Batam Kota", lat: 1.121378, lng: 104.019885 },
  { slug: "danganom3", name: "Taman Dang Anom Arah Jalan", area: "Batam Kota", lat: 1.121378, lng: 104.019885 },
  // CATATAN: slug bilang "batuaji" tapi lokasinya BUKAN Kec. Batu Aji. "damkar" =
  // pemadam kebakaran, di sebelah Stadion Temenggung. Menurut batas kecamatan BIG edisi Juni
  // 2026 (dicek 2026-09-28) titik ini masuk Kec. Batam Kota (batas Satu Data Batam menaruhnya
  // di Sei Beduk — dua sumber resmi berbeda di sini; app memakai BIG).
  // "Arah Batu Aji" di nama = arah hadap.
  { slug: "batuajidamkar1", name: "Depan Stadion Temenggung", area: "Batam Kota", lat: 1.088491, lng: 104.033566 },
  { slug: "batuajidamkar3", name: "Depan Stadion Temenggung Arah Batu Aji", area: "Batam Kota", lat: 1.088491, lng: 104.033566 },
];

/** Kamera yang punya koordinat → dipasang sebagai pin di peta. */
export const MAPPED_CAMS = CAMS.filter((c) => c.lat != null && c.lng != null);

/** Kamera tanpa koordinat → bagian "Belum Ada di Peta" di Daftar, tetap bisa dibuka. */
export const UNMAPPED_CAMS = CAMS.filter((c) => c.lat == null || c.lng == null);

export const findCam = (slug: string | null | undefined) =>
  slug ? CAMS.find((c) => c.slug === slug) ?? null : null;
