# Hujan di Batam

> Radar hujan real-time, prakiraan ombak, dan CCTV lalu lintas Batam — dalam satu peta.

**Live:** https://hujandibatam.masbash.id (Vercel, auto-deploy tiap push ke `main`)
**Repo:** https://github.com/bashideffendi/hujandibatam (publik — jangan commit secret)
**Stack:** Next.js 16 (App Router), React 19, Tailwind 4, Leaflet + react-leaflet, hls.js

## Kenapa

Batam cuma ~25 km di selatan Singapura, jadi posisinya pas di tengah jangkauan radar
240 km milik [Meteorological Service Singapore](https://www.weather.gov.sg/weather-rain-area-240km)
(MSS). BMKG belum menyediakan radar publik yang menjangkau Batam dengan resolusi
sebanding, jadi app ini mengambil citra MSS itu dan menampilkannya sebagai overlay di
atas peta — buat menjawab "lagi hujan apa nggak, dan dari arah mana awannya".

Prinsip: **"yakin aja"** — data hanya ditampilkan kalau representatif buat Batam, dan
setiap yang berasal dari Singapura ditandai sebagai proksi di antarmuka.

## Tiga mode

| Mode | Data | Sumber |
|---|---|---|
| **Hujan** | Overlay radar 240 km, 30 frame × 5 menit (2,5 jam), animasi & penggeser waktu; **deteksi echo ±20 km dari Batam**; prakiraan BMKG Batam Kota (3-jaman); strip kondisi (nowcast 2 jam, hujan terdekat, PSI, UV, angin) | MSS (radar), BMKG (prakiraan kelurahan), NEA via data.gov.sg (kondisi) |
| **Ombak** | Tinggi gelombang signifikan (swh) OFS/WAVEWATCH III sebagai tile pre-colored, 25 frame × 3 jam, mask daratan; prakiraan teks + peringatan dini Perairan Kep. Batam | BMKG OFS (tile), BMKG (prakiraan perairan E.02), CircleGeo (vector-tile daratan) |
| **CCTV** | 28 kamera lalu lintas Kota Batam, **satu stream on-demand** setelah pin diketuk; pin berdekatan dikelompokkan (ketuk untuk memperbesar); jalan pintas kamera terakhir dibuka | Pemerintah Kota Batam (HLS publik) |

Tampilan: tema otomatis siang/malam (jam WIB) + toggle manual; 3–4 preset cakupan; panel
bottom-sheet yang bisa dilipat; PWA installable (service worker minimal, data realtime
network-only); deep link `?mode=ombak`, `?view=natuna`, `?cam=<slug>`; tombol Bagikan
(Web Share API, fallback salin tautan).

**Panel di HP dibuat ringkas**: yang selalu tampil cuma status, jawaban echo/prakiraan,
pilihan mode, dan timeline (±33–42% tinggi layar). Pilihan cakupan, strip kondisi,
legenda, dan kredit ada di bagian **Detail** yang dibuka satu ketuk (pilihan tersimpan).
Di layar ≥ 701 px bagian itu selalu terbuka.

## Data & kejujuran tampilan

- **Radar MSS** terbit tiap 5 menit dengan jeda ~8 menit. `/api/frames` mem-probe file
  terbaru yang benar-benar ada (sampai 12 kandidat), lalu menyusun 30 frame mundur.
  Frame yang 404 ditandai dan dilewati (tidak pernah tampil sebagai "tidak hujan").
  Label **Langsung / Tertunda / Terputus** dihitung di klien dari umur citra.
- **Bounding box radar** `RADAR_BOUNDS` di `lib/radar.ts`: 480 km, 1 km/px, pusat
  1.356 N 103.964 E (≈ radar Changi) — hasil georeferensi basemap resmi MSS ke OSM
  (RMS 0,76 km). Diperbarui 2026-09 (nilai lama 8% terlalu sempit).
- **Legend hujan** memakai palet asli PNG MSS (cyan → hijau → kuning → merah → magenta),
  tiga tingkat resmi: ringan · sedang · lebat.
- **OFS BMKG**: modelrun BMKG sering memblokir fetch server-side (Cloudflare), jadi
  `/api/ofs-frame` berlapis: modelrun → probe tile → slot tebakan. Respons membawa
  `source`, `ageH`, `expired`; panel menandai run yang basi/kedaluwarsa.
- **CCTV**: armada Pemko sering mati. Sebelum player menarik video, satu playlist
  (~250 B) dicek: `#EXT-X-ENDLIST` = mati, `Last-Modified` tua = beku → pesan jujur,
  nol byte video, pin jadi abu. Audit armada dari laptop: `bash scripts/cctv-audit.sh`.
- **Disiplin bandwidth CCTV**: ~2,4 Mbit/s per penonton ditanggung server Pemko.
  Tidak ada grid, tidak ada autoplay massal, stream berhenti saat tab disembunyikan.

## Environment variables

| Nama | Wajib | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_CARTO_KEY` | ya | API key [CARTO Basemaps](https://carto.com/basemaps/apikey) (gratis s/d 5 juta tile/bulan). Tanpa key, tile basemap berwatermark "API KEY REQUIRED". Key ini memang terlihat di browser — batasi ke domain lewat *Referer restriction* di dashboard CARTO. Set di Vercel (Production) dan di `.env.local` (di-gitignore). |

Lihat `.env.example`.

## Pengembangan

```bash
git clone https://github.com/bashideffendi/hujandibatam.git
cd hujandibatam
npm install
cp .env.example .env.local   # isi NEXT_PUBLIC_CARTO_KEY
npm run build                # verifikasi pakai build; `npm run dev` berat di laptop 12 GB
npm start
```

Struktur kode:

| Lokasi | Isi |
|---|---|
| `lib/sources.ts` | semua host/URL eksternal (satu tempat) |
| `lib/api-types.ts` | bentuk respons API, dipakai server & klien |
| `lib/status.ts` | aturan tampilan (segar/tertunda, teks echo, dll.) — fungsi murni |
| `lib/echo.ts` | deteksi echo dari piksel PNG radar (server) |
| `hooks/` | pipeline data: `useRadar`, `useOfs`, `useResource`, `useThemeMode`, polling |
| `components/RadarMap.tsx` | orkestrator: merangkai hook, peta, dan panel |
| `components/panel/` | potongan panel: status, kontrol, kondisi, legenda, kredit |
| `app/api/` | `frames`, `conditions`, `prakiraan`, `ofs-frame`, `perairan` |

Catatan:
- hls.js memakai build **penuh**. Jangan ganti ke `hls.js/light`: build itu tidak punya
  parser HEVC-dalam-TS, padahal sebagian kamera menyiarkan H.265.
- Route handler dinamis (`force-dynamic`); CDN boleh menahan 30–60 detik (`s-maxage`).
  Jangan pakai ISR/prerender untuk data berjam — pernah membekukan jam tampilan.
- Function region: Singapura (`vercel.json`).
- Header keamanan (nosniff, Referrer-Policy, frame-ancestors, Permissions-Policy, HSTS)
  di `next.config.ts`.

## Atribusi

Citra radar © Meteorological Service Singapore · Kondisi cuaca © National Environment
Agency (data.gov.sg) · Prakiraan gelombang © BMKG · Daratan © OpenStreetMap contributors
(via CircleGeo) · Basemap © OpenStreetMap contributors, © CARTO · CCTV © Pemerintah Kota Batam.

Tanpa pelacak. Peta, radar, dan video ditarik langsung ke perangkat pengguna dari
sumber di atas.

## Lisensi

Proyek pribadi. © Bashid Effendi 2026.
