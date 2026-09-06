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
// Satu segmen HLS ≈ 2,7 MB / 9,6 detik → ~2,3 Mbit/s, atau ~1 GB per jam per
// penonton. Yang nanggung server sumber, bukan server kita. Makanya:
//   - nggak ada grid, nggak ada autoplay, nggak ada prefetch/preload;
//   - cuma SATU stream hidup dalam satu waktu, dan cuma sesudah user klik pin;
//   - player wajib di-destroy pas ditutup (lihat components/CctvPlayer.tsx).
// Kalau nanti mau bikin mode "tembok kamera", jangan — itu bakal mukul server
// instansi yang nggak pernah setuju jadi CDN kita.
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

export type Cam = {
  slug: string;
  name: string;
  area: string;
  lat?: number;
  lng?: number;
  /** true = titik acuan terdekat, bukan posisi kamera persis. */
  approx?: boolean;
};

/** Kredit sumber. Ganti/kosongkan di sini kalau kebijakannya berubah. */
export const CCTV_CREDIT = "CCTV Pemerintah Kota Batam";

/**
 * Host sumber. Catatan jujur: hostname ini tetap kelihatan siapa pun yang buka
 * tab Network di browser — nggak ada cara menyembunyikannya dari sisi klien.
 */
const CCTV_HOST = "https://matanya.batam.go.id";

export const streamUrl = (slug: string) => `${CCTV_HOST}/cctv/${slug}/stream.m3u8`;

export const CAMS: Cam[] = [
  // — Batam Kota / pusat pemerintahan —
  { slug: "atap", name: "Atap Kantor Wali Kota", area: "Batam Kota", lat: 1.127943, lng: 104.055197 },
  { slug: "dprd", name: "Depan Kantor DPRD", area: "Batam Kota", lat: 1.126903, lng: 104.055462 },
  { slug: "kejaksaanbi", name: "Simpang BI", area: "Batam Kota", lat: 1.128026, lng: 104.056966 },
  { slug: "southgate", name: "Gerbang Selatan Engku Putri", area: "Batam Kota", lat: 1.126500, lng: 104.054085, approx: true },
  { slug: "gerutara", name: "Gerbang Utara Engku Putri", area: "Batam Kota", lat: 1.129500, lng: 104.054085, approx: true },
  { slug: "madanipancuran", name: "Bundaran Madani Pancuran", area: "Batam Kota", lat: 1.133783, lng: 104.042511 },
  { slug: "madaniseipanas", name: "Bundaran Madani arah Sei Panas", area: "Batam Kota", lat: 1.133783, lng: 104.042511, approx: true },
  { slug: "simpkuda1", name: "Simpang Kuda", area: "Sungai Panas", lat: 1.136283, lng: 104.027114 },
  { slug: "sukajadi2", name: "Depan Perumahan Sukajadi", area: "Batam Kota", lat: 1.104559, lng: 104.026126, approx: true },
  { slug: "casablanca2", name: "Simpang Casablanca", area: "Batam Kota", lat: 1.121195, lng: 104.016326, approx: true },

  // — Lubuk Baja / Jodoh–Nagoya —
  { slug: "cobaan", name: "Nagoya Plaza", area: "Lubuk Baja", lat: 1.146140, lng: 104.010987 },
  { slug: "pasarjodoh2", name: "Depan Pasar Jodoh", area: "Lubuk Baja", lat: 1.151230, lng: 104.005230 },

  // — Sekupang / Tiban —
  { slug: "sekupang", name: "Pelabuhan Sekupang", area: "Sekupang", lat: 1.126240, lng: 103.928415 },
  { slug: "seiladi2", name: "Simpang Sei Ladi", area: "Sekupang", lat: 1.108161, lng: 104.011206, approx: true },
  { slug: "pura1", name: "Depan Pura Sei Ladi", area: "Sekupang", lat: 1.108161, lng: 104.011206, approx: true },
  { slug: "matakucing1", name: "Mata Kucing", area: "Sekupang", lat: 1.085136, lng: 103.971603, approx: true },
  { slug: "delta2", name: "Depan Delta Villa arah Mata Kucing", area: "Sekupang", lat: 1.102452, lng: 103.960683 },
  { slug: "southlink1", name: "Tanjakan Southlink", area: "Tiban", lat: 1.113720, lng: 103.996030, approx: true },
  { slug: "ptzsouthlink", name: "Tanjakan Southlink (PTZ)", area: "Tiban", lat: 1.114200, lng: 103.996030, approx: true },

  // — Batu Aji / Sagulung —
  { slug: "batuaji", name: "Depan SP Plaza Batu Aji", area: "Batu Aji", lat: 1.042239, lng: 103.982872 },

  // — Nongsa —
  { slug: "sambau1", name: "Pertigaan Sambau 1", area: "Nongsa", lat: 1.154257, lng: 104.100716, approx: true },
  { slug: "sambau2", name: "Pertigaan Sambau 2", area: "Nongsa", lat: 1.154757, lng: 104.100716, approx: true },
  { slug: "punggur1", name: "Pelabuhan Punggur", area: "Nongsa", lat: 1.034618, lng: 104.132155 },

  // — Titik dipastikan manual lewat Google Maps (2026-09-07) —
  // Ketiganya nggak ketemu di Nominatim/Overpass, jadi diverifikasi di lapangan-peta.
  { slug: "engkuhamidah1", name: "Engku Hamidah", area: "Batam Kota", lat: 1.125114, lng: 104.026894 },
  { slug: "danganom1", name: "Taman Dang Anom", area: "Batam Kota", lat: 1.121378, lng: 104.019885 },
  { slug: "danganom3", name: "Taman Dang Anom arah Jalan", area: "Batam Kota", lat: 1.121378, lng: 104.019885 },
  // CATATAN: slug bilang "batuaji" tapi lokasinya BUKAN Kec. Batu Aji. "damkar" =
  // pemadam kebakaran, dan kantornya ada di Duriangkang, Sukajadi, Kec. Batam Kota
  // (persis di sebelah Stadion Temenggung). "arah Batu Aji" di nama = arah hadap.
  { slug: "batuajidamkar1", name: "Depan Stadion Temenggung", area: "Sukajadi", lat: 1.088491, lng: 104.033566 },
  { slug: "batuajidamkar3", name: "Depan Stadion Temenggung arah Batu Aji", area: "Sukajadi", lat: 1.088491, lng: 104.033566 },
];

/** Kamera yang punya koordinat → dipasang sebagai pin di peta. */
export const MAPPED_CAMS = CAMS.filter((c) => c.lat != null && c.lng != null);

/** Kamera tanpa koordinat → daftar chip di panel, tetap bisa dibuka. */
export const UNMAPPED_CAMS = CAMS.filter((c) => c.lat == null || c.lng == null);
