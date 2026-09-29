// ---------------------------------------------------------------------------
// Turunan TAMPILAN dari data mentah — fungsi murni (tanpa React, tanpa I/O), jadi
// gampang diuji dan satu-satunya tempat aturan "jujur soal kesegaran" + SALINAN panel
// didefinisikan. Gaya tulis: Title Case untuk judul/label/baris singkat (kata tugas EYD
// tetap kecil), kalimat penjelasan tetap kalimat biasa.
// ---------------------------------------------------------------------------
import type {
  EchoSummary,
  ForecastResponse,
  OfsResponse,
  PerairanEntry,
  PerairanResponse,
} from "./api-types";
import {
  KAB_ORDER,
  inScope,
  kabRank,
  kecLevel,
  rainyKec,
  type KecEcho,
  type RainLevel,
  type RainScope,
} from "./kecamatan";
import { currentSlot, warnAt } from "./perairan";
import { ageMinutesOf, ofsValidWib, tsToInstant, type Frame } from "./radar";

/** Di atas ini citra radar dianggap terlambat (MSS terlambat/macet). */
export const LIVE_MAX_AGE_MIN = 18;
/** Lebih dari ini: bukan lagi "terlambat n menit" tapi "belum diperbarui". */
export const RADAR_OLD_MIN = 60;
/** Run OFS lebih tua dari 2 siklus (12 jam) = BMKG mandek. Umur wajar run terbaru 8–20 jam. */
export const OFS_STALE_H = 24;
/** Respons lama (tanpa per kecamatan): kelas baru disebut kalau luasnya ≥ ini (1 px = 1 km²). */
export const LEVEL_MIN_PX = 10;

export type LoadStatus = "loading" | "ok" | "error";
export type EchoLevel = RainLevel;
export type Tone = "normal" | "muted" | "warn";
export type Answer = {
  headline: string;
  tone: Tone;
  /** titik warna kelas hujan di depan jawaban */
  dot: EchoLevel | null;
  context: string;
  /** tawarkan "Coba Lagi" */
  retry: boolean;
  /** isi bilah mini saat panel dilipat */
  mini: string;
  /** teks Bagikan */
  share: string;
  /** teks pembaca layar — TIDAK bergantung posisi penggeser, jadi tak berbunyi tiap frame */
  live: string;
};
export type Caption = { left: string; right: string | null; warn: boolean; toNow: boolean };

// ---- teks ------------------------------------------------------------------
export const fmtM = (n: number) => String(n).replace(".", ",");
/** "0.5 - 1.25 m" → "0,5–1,25 m" */
export const fmtWave = (s: string) => s.replace(/\./g, ",").replace(/\s*-\s*/, "–");
export const ktToKmh = (kt: number) => Math.round(kt * 1.852);

// Kata tugas (EYD) yang tetap huruf kecil di tengah judul.
const SMALL = new Set([
  "di", "ke", "dari", "dan", "atau", "yang", "untuk", "pada", "dengan", "per", "sejak",
  "sampai", "hingga", "oleh", "dalam", "bagi", "tentang", "antara", "serta", "tetapi",
]);
const ACRONYMS = new Set(["BMKG", "MSS", "NEA", "PSI", "UV", "WIB", "PTZ", "BI", "DPRD", "SP"]);
// Satuan tetap huruf kecil ("2,5 m", "40 km/j").
const UNITS = new Set(["m", "mm", "cm", "km", "km/j", "km/jam", "knot", "kt", "meter"]);

function titleWord(w: string, first: boolean): string {
  const bare = w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "");
  // akronim yang dikenal tetap kapital; kata lain yang SELURUHNYA kapital ("HUJAN") dirapikan
  if (ACRONYMS.has(bare.toUpperCase()) && bare === bare.toUpperCase()) return w;
  // angka/kode ("0.5", "E.02") dibiarkan apa adanya
  if (/\d/.test(bare)) return w;
  const lower = w.toLowerCase();
  if (!first && (SMALL.has(bare.toLowerCase()) || UNITS.has(bare.toLowerCase()))) return lower;
  // Kapital di awal tiap bagian kata ulang/garis miring/kurung: "abu-abu" → "Abu-Abu".
  return lower.replace(/(^|[-/(“"'])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

/** Title Case bahasa Indonesia: "waspada angin kencang dan gelombang tinggi" → "Waspada Angin Kencang dan Gelombang Tinggi". */
export function titleCase(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  let first = true;
  return t
    .split(" ")
    .map((w) => {
      const out = titleWord(w, first);
      if (/[\p{L}\d]/u.test(w)) first = false;
      // sesudah titik dua / titik, kata berikutnya dianggap awal lagi
      if (/[:.]$/.test(w)) first = true;
      return out;
    })
    .join(" ");
}

const ARAH: Record<string, string> = {
  U: "Utara",
  TL: "Timur Laut",
  T: "Timur",
  TG: "Tenggara",
  S: "Selatan",
  BD: "Barat Daya",
  B: "Barat",
  BL: "Barat Laut",
};
/** Kode mata angin NEA ("TL") atau teks BMKG ("timur laut") → "Timur Laut". */
export const arahLengkap = (kode: string) => ARAH[kode.trim().toUpperCase()] ?? titleCase(kode);

/** Menit → "Baru Saja" / "25 Menit" / "2,5 Jam". */
function durasi(min: number): string {
  if (min < 1) return "Baru Saja";
  if (min < 90) return `${min} Menit`;
  return `${fmtM(Math.round(min / 30) / 2)} Jam`;
}
const lalu = (min: number) => (min < 1 ? "Baru Saja" : `${durasi(min)} Lalu`);

/** Tanggal WIB (YYYY-MM-DD) dari instant ms. */
const wibDay = (ms: number) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);
/** "10.15 WIB", atau "Sabtu 10.15" kalau citranya bukan dari hari ini. */
function whenLabel(f: Frame, now: number): string {
  const inst = tsToInstant(f.ts);
  const otherDay = inst !== null && wibDay(inst) !== wibDay(now);
  return otherDay ? `${f.date.split(",")[0]} ${f.time}` : `${f.time} WIB`;
}

// ---- HUJAN ----------------------------------------------------------------
export type RadarView = {
  current: Frame | undefined;
  latest: Frame | undefined;
  isLatest: boolean;
  /** cukup frame untuk diputar/digeser */
  ready: boolean;
  latestAge: number | null;
  /** frame yang sedang dipilih ternyata 404 di MSS */
  currentBroken: boolean;
  /** citra terbaru segar (status ok, umur ≤ LIVE_MAX_AGE_MIN) */
  fresh: boolean;
  /** sedang menampilkan citra terbaru DAN citranya segar */
  ok: boolean;
  /** umur frame pertama (menit) — ujung kiri penggeser */
  spanMin: number | null;
  /** waktu citra terbaru untuk keadaan tidak segar: "10.15 WIB", atau "Sabtu 10.15" kalau bukan hari ini */
  latestWhen: string;
  sliderText: string;
};

export function radarView(a: {
  frames: Frame[];
  idx: number;
  status: LoadStatus;
  offline: boolean;
  now: number;
  broken: ReadonlySet<string>;
}): RadarView {
  const { frames, idx, status, offline, now, broken } = a;
  const current = frames[idx];
  const latest = frames[frames.length - 1];
  const isLatest = frames.length > 0 && idx === frames.length - 1;
  const latestAge = latest ? ageMinutesOf(latest.ts, now) : null;
  // Kesegaran dihitung di klien dari umur citra — frame beku tetap ketahuan walau API tak
  // terjangkau. (Flag `stale` server sengaja tidak dipakai: umur citra lebih jujur; "lastGood"
  // dengan umur ≤18 menit memang belum terlambat.) Offline = tak bisa menjamin "sekarang".
  const fresh = status === "ok" && !offline && latestAge !== null && latestAge <= LIVE_MAX_AGE_MIN;
  const currentAge = current ? ageMinutesOf(current.ts, now) : null;
  return {
    current,
    latest,
    isLatest,
    ready: frames.length >= 2,
    latestAge,
    currentBroken: !!current && broken.has(current.url),
    fresh,
    ok: isLatest && fresh && !(!!current && broken.has(current.url)),
    spanMin: frames.length ? ageMinutesOf(frames[0].ts, now) : null,
    latestWhen: latest ? whenLabel(latest, now) : "",
    sliderText: current ? `${current.time} WIB, ${lalu(currentAge ?? 0)}` : "",
  };
}

/** Wilayah peta → cakupan jawaban: "Batam" = Kota Batam; "Kepri"/"Luas" = semua kab/kota Kepri. */
export const scopeOf = (view: string): RainScope => (view === "batam" ? "batam" : "kepri");

/** Daftar kecamatan untuk satu cakupan: Kepri dari `region.kec`, Batam dari `kec` akar. */
const kecList = (e: EchoSummary | null | undefined, scope: RainScope): KecEcho[] | undefined =>
  (scope === "kepri" ? (e?.region?.kec ?? e?.kec) : e?.kec)?.filter((k) => inScope(k, scope));

/** Data echo yang dipersempit ke satu cakupan. Respons lama tanpa `region` → pakai data Batam. */
function scoped(e: EchoSummary, scope: RainScope): { kec: KecEcho[] | null; near: boolean; lastTs: string | null } {
  const kec = kecList(e, scope) ?? null;
  if (scope === "kepri" && e.region) return { kec, near: e.region.near, lastTs: e.region.lastTs };
  return { kec, near: e.near, lastTs: e.lastTs };
}

/**
 * Kelas hujan yang JUJUR. Per kecamatan (lib/kecamatan.ts): kelas terderas di antara kecamatan
 * yang hujan dalam cakupan. Respons lama tanpa per kecamatan: kelas tertinggi yang luasnya ≥10 km².
 */
export function rainLevel(e: EchoSummary, scope: RainScope = "batam"): EchoLevel | null {
  const sc = scoped(e, scope);
  if (!sc.near) return null;
  if (sc.kec) return rainyKec(sc.kec)[0]?.level ?? null;
  const b = e.byClass;
  if (!b) return e.level; // respons lama tanpa hitungan per kelas
  if (b.lebat >= LEVEL_MIN_PX) return "lebat";
  if (b.lebat + b.sedang >= LEVEL_MIN_PX) return "sedang";
  return "ringan";
}

const LEVEL_TEXT: Record<EchoLevel, string> = {
  ringan: "Hujan Ringan",
  sedang: "Hujan Sedang",
  lebat: "Hujan Lebat",
};
/** Persen area, dibulatkan; "<1" kalau di bawah 0,5%. */
const pctArea = (coverage: number) => {
  const p = coverage * 100;
  return p < 0.5 ? "<1" : String(Math.round(p));
};

/** "Sekupang" · "Sekupang dan Batu Aji" · "Sekupang, Batu Aji, dan Sagulung". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} dan ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, dan ${names[names.length - 1]}`;
}

/**
 * Di mana hujannya, dua bentuk:
 *  - `phrase` untuk kalimat ("Hujan Ringan di …"): nama kecamatan / "5 Kecamatan Kepri";
 *  - `line` untuk baris konteks panel ("Di Sekupang dan Batu Aji", "5 Kecamatan di Batam dan Bintan").
 * Batam: nama kecamatan (≤3) atau "5 dari 12 Kecamatan". Kepri: nama + kab/kota dalam kurung
 * (≤2), atau jumlah kecamatan per kab/kota.
 */
function rainWhere(echo: EchoSummary, scope: RainScope): { phrase: string; line: string; none: string } {
  const sc = scoped(echo, scope);
  const none = scope === "batam" ? "Kota Batam" : "Kepri";
  if (!sc.kec) return { phrase: "Sekitar Batam", line: "Sekitar Batam", none: "Sekitar Batam" }; // respons lama
  const rainy = rainyKec(sc.kec);
  if (!rainy.length) return { phrase: none, line: none, none };
  if (scope === "batam") {
    if (rainy.length <= 3) {
      const names = joinNames(rainy.map((k) => k.name));
      return { phrase: names, line: `Di ${names}`, none };
    }
    const n = `${rainy.length} dari ${sc.kec.length} Kecamatan`;
    return { phrase: n, line: `Di ${n}`, none };
  }
  const kabs = [...new Set(rainy.map((k) => k.kab))].sort((a, b) => kabRank(a) - kabRank(b));
  if (rainy.length <= 2) {
    // satu kab/kota: "Nongsa dan Sekupang (Batam)"; beda: "Bintan Timur (Bintan) dan Meral (Karimun)"
    const names =
      kabs.length === 1
        ? `${joinNames(rainy.map((k) => k.name))} (${kabs[0]})`
        : joinNames(rainy.map((k) => `${k.name} (${k.kab})`));
    return { phrase: names, line: `Di ${names}`, none };
  }
  const where = kabs.length <= 3 ? joinNames(kabs) : `${kabs.length} Kabupaten/Kota`;
  return { phrase: `${rainy.length} Kecamatan Kepri`, line: `${rainy.length} Kecamatan di ${where}`, none };
}

type Cond = { text: string; level: EchoLevel | null; known: boolean; where: string; line: string; none: string };
function rainCond(echo: EchoSummary | null, scope: RainScope): Cond {
  if (!echo) return { text: "Lihat Warna di Peta", level: null, known: false, where: "", line: "", none: "" };
  const w = rainWhere(echo, scope);
  const sc = scoped(echo, scope);
  if (sc.near) {
    const level = rainLevel(echo, scope) ?? "ringan";
    return { text: LEVEL_TEXT[level], level, known: true, where: w.phrase, line: w.line, none: w.none };
  }
  if (sc.lastTs) return { text: "Hujan Sudah Reda", level: null, known: true, where: w.none, line: w.none, none: w.none };
  return { text: "Tidak Ada Hujan", level: null, known: true, where: w.none, line: w.none, none: w.none };
}
/** "Hujan Ringan di Sekupang dan Batu Aji" / "Tidak Ada Hujan di Kota Batam". */
const condSentence = (c: Cond) => (c.known ? `${c.text} di ${c.where}` : c.text);

export function rainAnswer(a: {
  echo: EchoSummary | null;
  frames: Frame[];
  rv: RadarView;
  status: LoadStatus;
  offline: boolean;
  now: number;
  /** Kota Batam (bawaan) atau semua kab/kota Kepri dalam jangkauan radar */
  scope?: RainScope;
}): Answer {
  const { echo, frames, rv, status, offline, now } = a;
  const scope = a.scope ?? "batam";
  const latest = rv.latest;
  const base = (headline: string, context: string, extra: Partial<Answer> = {}): Answer => ({
    headline,
    context,
    tone: "warn",
    dot: null,
    retry: false,
    mini: headline,
    share: "Radar Hujan Batam",
    live: [headline, context].filter(Boolean).join(". "),
    ...extra,
  });

  if (!latest) {
    if (offline) return base("Kamu Sedang Offline", "Radar Muncul Lagi Saat Ada Sinyal");
    if (status === "error") return base("Radar Belum Bisa Dimuat", "", { retry: true });
    return base("Memuat Radar…", "", { tone: "muted", live: "" });
  }

  const cond = rainCond(echo, scope);
  const t = latest.time;
  const lastLabel = `Terakhir ${whenLabel(latest, now)}`;
  const share = cond.known ? `Radar ${t} WIB: ${condSentence(cond)}` : `Radar Hujan Batam ${t} WIB`;
  const mini = (h: string) => `${h} · ${t}`;

  if (offline) {
    const ctx = `${lastLabel}: ${condSentence(cond)}`;
    return base("Kamu Sedang Offline", ctx, { mini: mini("Offline"), share });
  }
  if (status === "error") {
    const ctx = `${lastLabel}: ${condSentence(cond)}`;
    return base("Radar Terputus", ctx, { retry: true, mini: mini("Radar Terputus"), share });
  }
  const age = rv.latestAge ?? 0;
  if (age > RADAR_OLD_MIN) {
    const ctx = `${lastLabel}: ${condSentence(cond)}`;
    return base("Radar Belum Diperbarui", ctx, { mini: mini("Radar Belum Diperbarui"), share });
  }
  if (age > LIVE_MAX_AGE_MIN) {
    const h = `Radar Terlambat ${age} Menit`;
    const ctx = `Pukul ${t}: ${condSentence(cond)}`;
    // live tanpa angka menit: kalau tidak, pembaca layar berbunyi tiap menit
    return base(h, ctx, { mini: mini("Radar Terlambat"), share, live: `Radar terlambat. ${ctx}` });
  }

  // Normal: citra terbaru segar.
  let context: string;
  // Jam citra radar ada di ujung kanan penggeser ("Terbaru 11.30 WIB"), jadi baris konteks
  // cukup menyebut DI MANA — muat satu baris di HP.
  const sc = echo ? scoped(echo, scope) : null;
  if (!echo || !sc) context = "Deteksi Hujan Gagal, Lihat Warna di Peta";
  else if (sc.near) context = echo.kec ? cond.line : `Sekitar Batam, ${pctArea(echo.coverage)}% Area`;
  else if (sc.lastTs) {
    const last = frames.find((f) => f.ts === sc.lastTs)?.time;
    context = `${cond.none}, Terakhir ${last ?? "—"}`;
  } else {
    const lb = echo.lookbackMin >= 60 && echo.lookbackMin % 60 === 0 ? `${echo.lookbackMin / 60} Jam` : `${echo.lookbackMin} Menit`;
    context = `${cond.none}, ${lb} Terakhir`;
  }
  const answer: Answer = {
    headline: cond.text,
    context,
    tone: "normal",
    dot: cond.level,
    retry: false,
    mini: mini(cond.text),
    share,
    live: `${cond.text}. ${context}. Radar ${t} WIB`,
  };
  // Penggeser di riwayat: jawaban tetap milik citra TERBARU, ditandai "Terkini:".
  if (!rv.isLatest) return { ...answer, headline: `Terkini: ${cond.text}`, tone: "muted" };
  return answer;
}

export function rainCaption(rv: RadarView, now: number): Caption {
  const { current, latest } = rv;
  if (!current || !latest) return { left: "", right: null, warn: false, toNow: false };
  // Caption kiri berbagi baris dengan tombol "Ke Sekarang" → versi pendek supaya kata
  // penentunya ("Lalu", "Tidak Tersedia") tidak terpotong di 360 px.
  if (rv.currentBroken) {
    return rv.isLatest
      ? { left: `Peta ${current.time} Tidak Tersedia`, right: null, warn: true, toNow: false }
      : { left: `${current.time} Tidak Tersedia`, right: null, warn: true, toNow: true };
  }
  if (!rv.isLatest) {
    const age = ageMinutesOf(current.ts, now) ?? 0;
    return { left: `${current.time} WIB, ${lalu(age)}`, right: null, warn: false, toNow: true };
  }
  return {
    left: rv.spanMin !== null ? lalu(rv.spanMin) : "",
    right: rv.fresh ? `Terbaru ${latest.time} WIB` : rv.latestWhen,
    warn: false,
    toNow: false,
  };
}

export type KecRow = { code: string; name: string; level: EchoLevel | null; text: string };
export type KecGroup = { kab: string; rows: KecRow[]; rainy: number };

/**
 * "Hujan per Kecamatan" dalam cakupan, dikelompokkan per kab/kota (Batam dulu). Di tiap
 * kelompok yang hujan di atas (terderas, terluas), sisanya urut nama.
 */
export function kecTable(e: EchoSummary | null, scope: RainScope = "batam"): KecGroup[] {
  const list = kecList(e, scope);
  if (!list) return [];
  const rank = { lebat: 3, sedang: 2, ringan: 1 } as const;
  const groups = new Map<string, (KecRow & { rain: number })[]>();
  for (const k of list) {
    if (!inScope(k, scope)) continue;
    const level = kecLevel(k);
    const row = {
      code: k.code,
      name: k.name,
      level,
      rain: k.rain,
      text: level ? `${LEVEL_TEXT[level].replace("Hujan ", "")} · ${fmtM(Math.max(1, Math.round(k.rain)))} km²` : "Tidak Hujan",
    };
    const g = groups.get(k.kab);
    if (g) g.push(row);
    else groups.set(k.kab, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => kabRank(a) - kabRank(b))
    .map(([kab, rows]) => {
      rows.sort((a, b) =>
        a.level && b.level
          ? rank[b.level] - rank[a.level] || b.rain - a.rain
          : a.level
            ? -1
            : b.level
              ? 1
              : a.name.localeCompare(b.name, "id"),
      );
      return { kab, rows: rows.map(({ code, name, level, text }) => ({ code, name, level, text })), rainy: rows.filter((r) => r.level).length };
    });
}

/** Kode kecamatan yang sedang hujan (semua Kepri) beserta kelasnya — untuk arsiran & label peta. */
export function rainyMap(e: EchoSummary | null): Map<string, EchoLevel> {
  return new Map(rainyKec(kecList(e, "kepri")).map((k) => [k.code, k.level]));
}

/** Kab/kota dalam jangkauan (untuk teks penjelasan). */
export const KAB_LIST = joinNames([...KAB_ORDER]);

// ---- prakiraan BMKG (kelurahan) -------------------------------------------
export type ForecastStripView = {
  slots: { time: string; t: number | null; desc: string }[];
  /** versi satu baris untuk layar pendek */
  inline: string | null;
  /** catatan untuk Detail kalau strip tidak bisa tampil */
  note: string | null;
  /** ada slot "Udara Kabur" → Detail menjelaskan istilahnya */
  hasHaze: boolean;
};

export function forecastStrip(fc: ForecastResponse | null, error: boolean, now: number, n = 3): ForecastStripView {
  if (!fc) {
    return { slots: [], inline: null, note: error ? "Prakiraan BMKG belum bisa dimuat." : null, hasHaze: false };
  }
  const slots = fc.slots
    .filter((s) => Date.parse(s.utc) > now)
    .slice(0, n)
    .map((s) => ({ time: s.time, t: s.t, desc: titleCase(s.desc) }));
  if (!slots.length) return { slots, inline: null, note: "Prakiraan BMKG belum diperbarui.", hasHaze: false };
  return {
    slots,
    inline: `Nanti: ${slots
      .slice(0, 2)
      .map((s) => `${s.time} ${s.desc}`)
      .join(", ")}`,
    note: null,
    hasHaze: slots.some((s) => /udara kabur/i.test(s.desc)),
  };
}

// ---- OMBAK ----------------------------------------------------------------
export type OfsView = {
  count: number;
  ready: boolean;
  failed: boolean;
  valid: string | undefined;
  wib: { time: string; day: string; date: string } | null;
  nowIndex: number;
  phase: "now" | "future" | "past";
  /** frame terakhir sudah lewat → "sekarang" sebenarnya frame lama */
  expired: boolean;
  /** baris masalah (hanya saat tidak normal) */
  problem: string | null;
  /** opacity field: diturunkan kalau mask darat gagal (darat jangan ketutup warna) */
  opacity: number;
  sliderText: string;
  /** ujung timeline, untuk label tombol Putar */
  lastWib: { time: string; day: string } | null;
  /** fetch gagal & belum ada data → tawarkan "Coba Lagi" */
  canRetry: boolean;
};

export function ofsView(a: {
  ofs: OfsResponse | null;
  idx: number;
  failed: boolean;
  tilesDown: boolean;
  maskOk: boolean | null;
  offline: boolean;
}): OfsView {
  const { ofs, idx, failed, tilesDown, maskOk, offline } = a;
  const count = ofs?.frames.length ?? 0;
  const ready = count > 0;
  const valid = ofs?.frames[idx];
  const wib = valid ? ofsValidWib(valid) : null;
  const last = ofs?.frames[count - 1];
  const nowIndex = ofs?.nowIndex ?? 0;
  const phase = idx === nowIndex ? "now" : idx > nowIndex ? "future" : "past";

  // Kesegaran dari UMUR run (bukan flag fallback): probe yang nemu run 4 jam lalu itu segar;
  // run dari modelrun yang mandek 30 jam itu basi. Slot buta = tebakan → selalu ditandai.
  const problem = !ready
    ? null
    : tilesDown
      ? "Peta Ombak Gagal Dimuat di Perangkat Ini"
      : ofs?.expired
        ? "BMKG Belum Memperbarui Peta Ombak"
        : ofs?.source === "blind"
          ? "Waktu Peta Ombak Belum Pasti"
          : (ofs?.ageH ?? 0) > OFS_STALE_H
            ? `Peta Ombak Lama, Dibuat ${ofs?.ageH} Jam Lalu`
            : maskOk === false
              ? "Warna di Atas Daratan Bukan Data"
              : null;

  return {
    count,
    ready,
    failed,
    valid,
    wib,
    nowIndex,
    phase,
    expired: !!ofs?.expired,
    problem,
    opacity: maskOk === false ? 0.45 : 1,
    sliderText: wib ? `${wib.date}, ${wib.time} WIB` : "",
    lastWib: last ? ofsValidWib(last) : null,
    canRetry: failed && !ready && !offline,
  };
}

export function ofsCaption(ov: OfsView): Caption {
  if (!ov.ready || !ov.wib) return { left: "", right: null, warn: false, toNow: false };
  const { time, day } = ov.wib;
  if (ov.phase === "now") {
    // data kedaluwarsa: frame "sekarang" hanyalah frame terakhir yang tersedia
    return ov.expired
      ? { left: `Peta ${day} ${time}, Terakhir Tersedia`, right: null, warn: true, toNow: false } // muat di 360 px
      : { left: `Peta BMKG ${time} WIB, Sekarang`, right: null, warn: false, toNow: false };
  }
  // berbagi baris dengan "Ke Sekarang" → versi pendek
  if (ov.phase === "future") return { left: `${day} ${time}, Prakiraan`, right: null, warn: false, toNow: true };
  return { left: `${time}, Sudah Lewat`, right: null, warn: false, toNow: true };
}

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** ISO atau "2026-09-26 23:39 UTC" (format BMKG) → waktu WIB siap tampil. */
function wibParts(s: string): { day: string; date: string; time: string; key: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(?:Z|UTC)?$/.exec(s.trim());
  const ms = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : Date.parse(s);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    day: HARI[d.getUTCDay()],
    date: `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`,
    time: `${p(d.getUTCHours())}.${p(d.getUTCMinutes())}`,
    key: d.toISOString().slice(0, 10),
  };
}
const hhmm = (iso: string) => wibParts(iso)?.time ?? "";
/** Jendela berlaku prakiraan: "Sen 07.00–19.00 WIB" / "Sen 19.00 – Sel 07.00 WIB". */
function windowText(fromIso: string, toIso: string): string {
  const a = wibParts(fromIso);
  const b = wibParts(toIso);
  if (!a || !b) return "";
  return a.key === b.key ? `${a.day} ${a.time}–${b.time} WIB` : `${a.day} ${a.time} – ${b.day} ${b.time} WIB`;
}

/**
 * Angin panel: "Angin 15 km/j dari Tenggara" (kecepatan rata-rata jam ini; hembusan di Detail).
 * Respons bentuk lama (rentang min–maks): "Angin 17–78 km/j dari Utara". null kalau tak lengkap.
 */
function windKmh(e: PerairanEntry): string | null {
  const from = e.windFrom ? ` dari ${arahLengkap(e.windFrom)}` : "";
  if (e.windKt != null) return `Angin ${ktToKmh(e.windKt)} km/j${from}`;
  if (e.windMinKt === null || e.windMaxKt === null) return null;
  return `Angin ${ktToKmh(e.windMinKt)}–${ktToKmh(e.windMaxKt)} km/j${from}`;
}
/** Tinggi gelombang jam ini: "0,5 m" (bentuk lama: rentang teks "0,5–1,25 m"). */
const waveText = (e: PerairanEntry) => (e.waveM != null ? `${fmtM(e.waveM)} m` : fmtWave(e.waveDesc));
/** Rentang meter "0,4–0,6 m" (satu angka kalau sama). */
const rangeM = (a: number, b: number) => (a === b ? `${fmtM(a)} m` : `${fmtM(a)}–${fmtM(b)} m`);

export function ofsAnswer(
  p: PerairanResponse | null,
  perairanError: boolean,
  ov: OfsView,
  offline: boolean,
  now: number = Date.now(),
): Answer & { warning: string | null } {
  const plain = (headline: string, context: string, extra: Partial<Answer> = {}) => ({
    headline,
    context,
    tone: "normal" as Tone,
    dot: null,
    retry: false,
    // bilah mini = judul, supaya gangguan/offline tetap terlihat saat panel diciutkan
    mini: headline,
    share: "Prakiraan Ombak Perairan Batam (BMKG)",
    live: [headline, context].filter(Boolean).join(". "),
    warning: null,
    ...extra,
  });

  if (ov.failed && !ov.ready) {
    return offline
      ? plain("Kamu Sedang Offline", "Peta Ombak Muncul Lagi Saat Ada Sinyal", { tone: "warn" })
      : plain("Data Ombak Gangguan", "Belum Bisa Memuat Data BMKG", { tone: "warn", retry: true });
  }
  const { entry: e, upcoming } = currentSlot(p, now);
  if (!e) {
    if (!ov.ready || (!p && !perairanError)) return plain("Memuat Prakiraan Ombak…", "", { tone: "muted", live: "" });
    return plain("Lihat Warna di Peta", "Teks Prakiraan Perairan BMKG Belum Tersedia", {
      mini: "Ombak · Lihat Warna di Peta",
    });
  }

  const cat = titleCase(e.waveCat) || "—";
  const range = waveText(e);
  const headline = `Ombak ${cat}${range ? `, ${range}` : ""}`;
  const wind = windKmh(e);
  const context = upcoming
    ? `Mulai ${hhmm(e.validFrom)}${wind ? ` · ${wind}` : ""}`
    : wind
      ? `Perairan Batam · ${wind}`
      : `Perairan Batam · Berlaku sampai ${hhmm(e.validTo)} WIB`;
  const warning = warnText(p, e, now);
  return {
    headline,
    context,
    tone: "normal",
    dot: null,
    retry: false,
    mini: `Ombak ${cat}${range ? ` · ${range}` : ""}`,
    share: `Ombak Perairan Batam (BMKG): ${cat}${range ? `, ${range}` : ""}.${warning ? ` ${warning}.` : ""}`,
    live: [warning, headline, context].filter(Boolean).join(". "),
    warning,
  };
}

/**
 * Chip peringatan: "Peringatan Gelombang Tinggi 2,5–4 m", dengan "· Mulai 07.00" kalau buletin
 * belum berlaku. Respons lama tanpa `warn` → teks warning di entri.
 */
function warnText(p: PerairanResponse | null, e: PerairanEntry, now: number): string | null {
  if (!p?.warns) return e.warning ? titleCase(e.warning) : null;
  const { current, next } = warnAt(p.warns, now);
  if (current.status === "ok" && current.text) return titleCase(current.text);
  // sekarang jelas aman, tapi buletin berikut menyebut Batam → beri tahu kapan mulainya
  if (current.status === "ok" && next?.text) return `${titleCase(next.text)} · Mulai ${hhmm(next.from)}`;
  // status sekarang tak diketahui (buletin yang berlaku malam ini sudah ditimpa BMKG) tapi
  // buletin terbaru menyebut Batam → anggap berlaku (lebih aman daripada diam)
  if (current.status !== "ok" && next?.text) return titleCase(next.text);
  return null;
}
/** Baris "Peringatan" di Detail — "Belum Tersedia" kalau berkas peringatan gagal dimuat. */
function warnRows(p: PerairanResponse, e: PerairanEntry, now: number): { k: string; v: string }[] {
  if (!p.warns) {
    const until = e.warningUntil ? wibParts(e.warningUntil) : null;
    return [{ k: "Peringatan", v: e.warning ? `${titleCase(e.warning)}${until ? ` (s.d. ${until.day} ${until.time} WIB)` : ""}` : "Tidak Ada" }];
  }
  const { current, next } = warnAt(p.warns, now);
  const until = current.until ? wibParts(current.until) : null;
  const rows = [
    {
      k: "Peringatan",
      v:
        current.status !== "ok"
          ? "Belum Tersedia"
          : current.text
            ? `${titleCase(current.text)}${until ? ` (s.d. ${until.day} ${until.time} WIB)` : ""}`
            : "Tidak Ada",
    },
  ];
  if (next) {
    const from = wibParts(next.from);
    if (from) rows.push({ k: "Buletin Berikut", v: `Mulai ${from.day} ${from.time} WIB: ${next.text ? titleCase(next.text) : "Tidak Ada"}` });
  }
  return rows;
}

/** Isi "Prakiraan Perairan Batam (BMKG)" di Detail: label → nilai. */
export function perairanDetail(p: PerairanResponse | null, now: number = Date.now()): { k: string; v: string }[] {
  const e = currentSlot(p, now).entry;
  if (!p || !e) return [];
  const rows: { k: string; v: string }[] = [];
  const wave = waveText(e);
  rows.push({ k: "Ombak", v: `${titleCase(e.waveCat)}${wave ? `, ${wave}` : ""}` });
  if (e.next12) rows.push({ k: "12 Jam ke Depan", v: rangeM(e.next12.minM, e.next12.maxM) });
  const from = e.windFrom ? ` dari ${arahLengkap(e.windFrom)}` : "";
  if (e.windKt != null) {
    rows.push({ k: "Angin", v: `${fmtM(e.windKt)} knot (${ktToKmh(e.windKt)} km/j)${from}` });
    if (e.gustKt != null) rows.push({ k: "Hembusan", v: `${fmtM(e.gustKt)} knot (${ktToKmh(e.gustKt)} km/j)` });
  } else if (e.windMinKt !== null && e.windMaxKt !== null) {
    rows.push({
      k: "Angin",
      v: `${e.windMinKt}–${e.windMaxKt} knot (${ktToKmh(e.windMinKt)}–${ktToKmh(e.windMaxKt)} km/j)${from}`,
    });
  }
  if (e.currentKt != null) {
    rows.push({ k: "Arus", v: `${fmtM(Math.round(e.currentKt * 10) / 10)} knot${e.currentTo ? ` ke ${arahLengkap(e.currentTo)}` : ""}` });
  }
  if (e.weather) rows.push({ k: "Cuaca", v: titleCase(e.weather) });
  rows.push(...warnRows(p, e, now));
  const win = windowText(e.validFrom, e.validTo);
  if (win) rows.push({ k: "Berlaku", v: win });
  const issued = p.issued ? wibParts(p.issued) : null;
  if (issued) rows.push({ k: "Terbit", v: `${issued.day} ${issued.date}, ${issued.time} WIB` });
  const station = p.station || e.station;
  if (station) rows.push({ k: "Penerbit", v: titleCase(station.toLowerCase()) });
  return rows;
}

// ---- CCTV -----------------------------------------------------------------
export function cctvAnswer(total: number, failed: number): { headline: string; context: string } {
  return {
    headline: `${total} Kamera Lalu Lintas`,
    context: `Kamera Pemko Batam${failed > 0 ? ` · ${failed} Gagal Diputar Tadi` : ""}`,
  };
}
