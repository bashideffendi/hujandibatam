# Hujan di Batam

> Radar hujan real-time buat Batam & sekitarnya — data Meteorological Service Singapore.

**Status:** 🟡 Draft
**Live:** https://hujan.masbash.id _(rencana)_ · https://hujandibatam.vercel.app
**Repo:** https://github.com/bashideffendi/hujandibatam
**Stack:** Next.js 16, React 19, Tailwind 4, Leaflet + react-leaflet

## What

Batam cuma ~25 km selatan Singapura, jadi posisinya pas di tengah jangkauan radar
240 km milik [Meteorological Service Singapore](https://www.weather.gov.sg/weather-rain-area-240km).
Hujan di Batam ngambil citra radar hujan MSS itu, lalu nampilinnya sebagai overlay di
atas peta — biar gampang ngecek "lagi hujan apa nggak" dan dari arah mana awan datang,
tanpa harus baca peta full Singapura.

Semua pengambilan citra radar jalan dari sisi server (route handler) yang nge-parse
daftar frame langsung dari halaman MSS; gambar PNG-nya ditampilin di browser lewat
Leaflet `ImageOverlay` (nggak kena CORS karena cuma dirender, bukan dibaca pixel-nya).

## Features

- ✅ Overlay radar hujan 240 km di atas peta, **3 preset view** (Kota Batam / Regional 240 km / Kepulauan Riau) dengan `fitBounds` sadar-chrome
- ✅ Tema **otomatis siang/malam** (ikut jam WIB) + toggle manual tersimpan
- ✅ Time slider 25 frame (≈6 jam ke belakang) + animasi play
- ✅ Auto-refresh daftar frame tiap 5 menit (radar update tiap 15 menit)
- ✅ Label waktu WIB, penanda kota, atur transparansi + legenda intensitas
- ✅ PWA-lite (installable, tanpa service worker)
- 🚧 Kalibrasi presisi tinggi bounding box overlay 240 km (lihat catatan)

## Desain

Premium-elegant: wordmark serif (Fraunces), UI Inter, palet monokrom + 1 aksen
steel-blue, basemap minimalis (CARTO Positron / Dark Matter), radar *glow* (screen
blend) di mode gelap.

## Catatan kalibrasi overlay

MSS nggak mempublikasikan bounding box geografis citra 240 km. `RADAR_BOUNDS` di
`lib/radar.ts` diturunkan via registrasi basemap resmi MSS (`240km-v2.jpg`) terhadap
basemap 50 km yang presisi + bukti citra 240 km = paruh-tengah konsentris dari citra
480 km. Hasil: berpusat ~radar Changi (1.350 N, 103.95 E), span ~4.0° (~446 km).
Confidence medium. Lock presisi tinggi: georeferensi `240km-v2.jpg` (ada garis pantai)
vs OSM lalu baca sudutnya.

## Local Dev

```bash
git clone https://github.com/bashideffendi/hujandibatam.git
cd hujandibatam
npm install
npm run build   # CATATAN laptop 12 GB: verifikasi pakai build, JANGAN `npm run dev`
npm start
```

## Environment Variables

Nggak ada. Semua data ditarik dari endpoint publik MSS saat runtime.

## Deploy

- **Platform**: Vercel (auto-deploy tiap push ke `main`)
- **URL**: hujandibatam.vercel.app → custom domain hujan.masbash.id
- Route handler `/api/frames` di-cache 5 menit (ISR) biar hemat hit ke MSS.

## Atribusi

Citra radar hujan © Meteorological Service Singapore (weather.gov.sg).
Basemap © OpenStreetMap contributors, © CARTO.

## License

Personal project. © Bashid Effendi 2026.
