// Bentuk respons route handler — DIPAKAI BERSAMA server (anotasi tipe) & klien (import),
// biar field nggak "disalin tangan" lalu diam-diam beda.
import type { KecEcho } from "./kecamatan";
import type { Frame } from "./radar";

export type EchoSummary = {
  /** ada kecamatan KOTA BATAM yang hujan (≥ KEC_RAIN_MIN_KM2 di daratannya) pada frame terbaru */
  near: boolean;
  /** fraksi daratan Kota Batam yang terkena pantulan pada frame terbaru, 0–1 */
  coverage: number;
  /** kelas tertinggi di antara kecamatan yang hujan (palet MSS): ringan | sedang | lebat */
  level: "ringan" | "sedang" | "lebat" | null;
  /** km² per kelas di seluruh daratan Kota Batam. Opsional: respons lama belum punya. */
  byClass?: { ringan: number; sedang: number; lebat: number };
  /** luas daratan Kota Batam yang terpetakan ke piksel radar (km²) */
  landKm2?: number;
  /** hujan per kecamatan KOTA BATAM (km², 1 desimal) — tetap Batam saja demi klien lama */
  kec?: KecEcho[];
  /** ringkasan seluruh Kepri dalam jangkauan (Batam, Tanjungpinang, Bintan, Karimun, Lingga) */
  region?: {
    near: boolean;
    coverage: number;
    level: "ringan" | "sedang" | "lebat" | null;
    landKm2: number;
    /** ts (SGT) frame terakhir yang ada hujannya di Kepri dalam jendela lookback */
    lastTs: string | null;
    /** hujan per kecamatan: SEMUA kecamatan Kepri dalam jangkauan radar */
    kec?: KecEcho[];
  };
  /** ts (SGT) frame terakhir yang ada hujannya dalam jendela lookback; null = tidak ada */
  lastTs: string | null;
  /** panjang jendela yang diperiksa ke belakang, menit */
  lookbackMin: number;
};

export type FramesResponse = {
  frames: Frame[];
  count: number;
  /** MSS nggak nerbitin apa-apa (atau frame terbaru > 18 mnt). */
  stale: boolean;
  /** umur frame terbaru (menit) saat respons dibuat; null kalau frames kosong. */
  ageMinutes: number | null;
  /** "mss" = probe nemu file; "lastGood" = pakai hasil probe sebelumnya (≤3 jam); "none" = nihil. */
  source: "mss" | "lastGood" | "none";
  /** deteksi echo sekitar Batam dari piksel PNG (null kalau decode gagal). */
  echo: EchoSummary | null;
};

/**
 * Prakiraan resmi BMKG untuk "Perairan Kep. Batam" (P.R.02, API marine2026-data, lib/perairan.ts).
 * Kolom bagian atas = bentuk LAMA (API public_api E.02 yang sudah mati) dan tetap diisi demi
 * bundel lama yang masih terbuka; klien baru membaca kolom opsional di bawahnya.
 */
export type PerairanEntry = {
  validFrom: string; // ISO UTC — awal jam/slot prakiraan yang berlaku
  validTo: string; // ISO UTC
  timeDesc: string; // (lama) kosong
  waveCat: string; // Tenang/Rendah/Sedang/Tinggi/…
  waveDesc: string; // (lama) "0.5 m"
  windFrom: string; // arah asal angin, nama lengkap ("Tenggara")
  windTo: string; // (lama) kosong
  windMinKt: number | null; // (lama) = windKt
  windMaxKt: number | null; // (lama) = gustKt
  weather: string;
  weatherDesc: string; // (lama) kosong
  /** peringatan dini gelombang resmi yang menyebut perairan Batam; kosong = tidak ada */
  warning: string;
  /** tinggi gelombang signifikan jam ini (m) */
  waveM?: number | null;
  /** kecepatan angin & hembusan (knot) */
  windKt?: number | null;
  gustKt?: number | null;
  /** arah & kecepatan arus (knot) */
  currentTo?: string;
  currentKt?: number | null;
  /** rentang tinggi gelombang 12 jam ke depan (m) */
  next12?: { minM: number; maxM: number } | null;
  /** peringatan berlaku sampai (ISO UTC) */
  warningUntil?: string;
  /** stasiun penerbit, mis. "STASIUN METEOROLOGI KELAS I HANG NADIM BATAM" */
  station?: string;
};
/** Satu buletin peringatan dini gelombang BMKG (warnings.json), dinilai untuk perairan Batam. */
export type PerairanWarn = {
  /** "unknown" = tidak ada buletin yang mencakup saat itu — JANGAN tampilkan "Tidak Ada" */
  status: "ok" | "unknown";
  /** kosong = BMKG tidak menyebut perairan Batam */
  text: string;
  /** masa berlaku buletin (ISO UTC); bisa di depan (buletin terbit ±12 jam lebih awal) */
  from: string;
  until: string;
};
export type PerairanResponse = {
  code: string;
  name: string;
  issued: string;
  /** (bundel lama) entri yang mencakup jam sekarang MENURUT SERVER, atau yang terdekat ke depan */
  current: PerairanEntry | null;
  /** true kalau `current` belum mulai (jendela sekarang tidak ada di data) */
  upcoming: boolean;
  /** slot yang belum lewat (maks 48 jam) — klien baru memilih sendiri jam yang berlaku */
  slots?: PerairanEntry[];
  /** buletin peringatan yang diketahui server (masih berlaku/akan berlaku) — klien menilai dengan jamnya */
  warns?: PerairanWarn[];
  station?: string;
};

export type AqReading = { psi: number; pm25: number | null; label: string; color: string; ts: string | null };
export type WindReading = {
  /** km/jam (dibulatkan) */
  speed: number;
  /** knot mentah dari NEA */
  knots: number;
  deg: number;
  label: string;
  station?: string;
  ts: string | null;
};
export type RainReading = { mm: number; station: string; ts: string | null };
export type UvReading = { value: number; label: string; color: string; ts: string | null };
export type NowcastReading = {
  /** teks asli NEA, mis. "Light Rain" */
  raw: string;
  /** terjemahan ringkas, mis. "Hujan ringan" */
  text: string;
  rain: boolean;
  area: string;
  validFrom: string;
  validTo: string;
};

export type ConditionsResponse = {
  aq: AqReading | null;
  wind: WindReading | null;
  rain: RainReading | null;
  uv: UvReading | null;
  nowcast: NowcastReading | null;
  /** ISO saat respons dirakit (buat debugging kesegaran). */
  asOf: string;
};

/** Prakiraan cuaca BMKG per kelurahan (3-jaman) — data yang PERSIS Batam, bukan proksi. */
export type ForecastSlot = {
  /** ISO UTC */
  utc: string;
  /** jam WIB siap-tampil, "11.00" */
  time: string;
  /** deskripsi BMKG apa adanya, mis. "Hujan Ringan", "Udara Kabur" */
  desc: string;
  /** suhu °C */
  t: number | null;
  /** kelembapan % */
  hu: number | null;
  /** curah hujan mm */
  tp: number | null;
};
export type ForecastResponse = {
  /** nama pendek buat UI, mis. "Batam Kota" */
  place: string;
  /** "Teluk Tering, Batam Kota" */
  detail: string;
  /** waktu analisis model (ISO), kalau ada */
  analysis: string | null;
  /** slot mulai dari yang paling dekat dengan jam sekarang */
  slots: ForecastSlot[];
};

export type OfsResponse = {
  baserun: string;
  frames: string[];
  nowIndex: number;
  /** true kalau baserun BUKAN dari modelrun (probe/blind). */
  fallback: boolean;
  source: "modelrun" | "probe" | "blind";
  /** umur run (jam). */
  ageH: number;
  /** frame terakhir sudah lewat → data belum diperbarui BMKG. */
  expired: boolean;
};
