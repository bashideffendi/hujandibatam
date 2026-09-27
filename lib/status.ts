// ---------------------------------------------------------------------------
// Turunan TAMPILAN dari data mentah — fungsi murni (tanpa React, tanpa I/O), jadi
// gampang diuji dan satu-satunya tempat aturan "jujur soal kesegaran" didefinisikan.
// ---------------------------------------------------------------------------
import type { EchoSummary, ForecastResponse, OfsResponse, PerairanResponse } from "./api-types";
import { ageMinutesOf, ofsValidWib, type Frame } from "./radar";

/** Di atas ini citra radar dianggap tertunda (MSS terlambat/macet). */
export const LIVE_MAX_AGE_MIN = 18;
/** Run OFS lebih tua dari 2 siklus (12 jam) = BMKG mandek. Umur wajar run terbaru 8–20 jam. */
export const OFS_STALE_H = 24;

export type LoadStatus = "loading" | "ok" | "error";
export type Pill = { text: string; kind: "live" | "stale" | "muted" };

export const fmtM = (n: number) => String(n).replace(".", ",");
/** "0.5 - 1.25 m" → "0,5–1,25 m" */
export const fmtWave = (s: string) => s.replace(/\./g, ",").replace(/\s*-\s*/, "–");

// ---- HUJAN ----------------------------------------------------------------
export type RadarView = {
  current: Frame | undefined;
  isLatest: boolean;
  /** cukup frame untuk diputar/digeser */
  ready: boolean;
  latestAge: number | null;
  /** frame yang sedang dipilih ternyata 404 di MSS */
  currentBroken: boolean;
  /** sedang menampilkan citra terbaru DAN citranya segar */
  ok: boolean;
  pill: Pill;
  state: string;
  date: string;
  sliderText: string;
};

export function radarView(a: {
  frames: Frame[];
  idx: number;
  status: LoadStatus;
  stale: boolean;
  offline: boolean;
  now: number;
  broken: ReadonlySet<string>;
}): RadarView {
  const { frames, idx, status, stale, offline, now, broken } = a;
  const current = frames[idx];
  const isLatest = frames.length > 0 && idx === frames.length - 1;
  const currentAge = current ? ageMinutesOf(current.ts, now) : null;
  const latestAge = frames.length ? ageMinutesOf(frames[frames.length - 1].ts, now) : null;
  // "Langsung" dihitung di klien dari umur citra — frame beku tetap ketahuan walau API tak terjangkau.
  const live = status === "ok" && !stale && latestAge !== null && latestAge <= LIVE_MAX_AGE_MIN;
  const cut = status === "error";
  const currentBroken = !!current && broken.has(current.url);

  const pill: Pill = cut
    ? { text: offline ? "Offline" : "Terputus", kind: "stale" }
    : !frames.length
      ? { text: "Memuat", kind: "muted" }
      : !live
        ? { text: "Tertunda", kind: "stale" }
        : { text: "Langsung", kind: "live" };

  const state = !frames.length
    ? cut
      ? "Gagal memuat"
      : "Memuat"
    : !isLatest
      ? `Riwayat · −${Math.max(0, (currentAge ?? 0) - (latestAge ?? 0))} mnt`
      : cut
        ? "Terputus"
        : !live
          ? "Data tertunda"
          : "Citra terakhir";

  const date =
    offline && cut
      ? "Lagi offline — nunggu sinyal"
      : cut && !frames.length
        ? "Gagal memuat radar"
        : !current
          ? "Memuat data…"
          : currentBroken
            ? `Citra ${current.time} tidak tersedia dari MSS`
            : isLatest
              ? `${current.date} · citra ${latestAge ?? 0} mnt lalu`
              : current.date;

  return {
    current,
    isLatest,
    ready: frames.length >= 2,
    latestAge,
    currentBroken,
    ok: frames.length > 0 && isLatest && live,
    pill,
    state,
    date,
    sliderText: current ? `${current.time} WIB, ${current.date}` : "",
  };
}

/**
 * Jawaban langsung "sekitar Batam lagi ada hujan nggak?". Tetap disebut "echo" (bukan
 * "hujan"): radar melihat butiran di udara, belum tentu sampai tanah.
 */
export function echoLine(
  echo: EchoSummary | null,
  frames: Frame[],
  now: number,
  status: LoadStatus,
): string | null {
  if (!echo || status === "error" || !frames.length) return null;
  if (echo.near) {
    const level = echo.level ? ` · ${echo.level}` : "";
    const area = echo.coverage >= 0.005 ? ` · ${Math.round(echo.coverage * 100)}% area` : "";
    return `Radar ±20 km Batam: ADA echo${level}${area}`;
  }
  if (echo.lastTs) {
    const last = frames.find((f) => f.ts === echo.lastTs);
    const age = ageMinutesOf(echo.lastTs, now);
    return `Radar ±20 km Batam: nihil · terakhir ${last?.time ?? "—"}${age !== null ? ` (${age} mnt lalu)` : ""}`;
  }
  return `Radar ±20 km Batam: nihil ${echo.lookbackMin} mnt terakhir`;
}

/** Ringkas untuk dibagikan: "ada echo sedang sekitar Batam" / "sekitar Batam nihil echo". */
export function echoShort(echo: EchoSummary | null): string {
  if (!echo) return "";
  return echo.near ? `ada echo${echo.level ? ` ${echo.level}` : ""} sekitar Batam` : "sekitar Batam nihil echo";
}

/** Dua slot prakiraan BMKG terdekat: "08.00 hujan ringan 26° · 11.00 udara kabur 30°". */
export function forecastLine(fc: ForecastResponse | null): string | null {
  if (!fc?.slots.length) return null;
  const parts = fc.slots.slice(0, 2).map((s) => `${s.time} ${s.desc.toLowerCase()}${s.t !== null ? ` ${s.t}°` : ""}`);
  return `BMKG ${fc.place}: ${parts.join(" · ")}`;
}

// ---- OMBAK ----------------------------------------------------------------
export type OfsView = {
  count: number;
  ready: boolean;
  error: boolean;
  valid: string | undefined;
  wib: { time: string; date: string } | null;
  nowIndex: number;
  stale: boolean;
  date: string;
  state: string;
  /** opacity field: diturunkan kalau mask darat gagal (darat jangan ketutup warna) */
  opacity: number;
  sliderText: string;
  /** fetch gagal & belum ada data → tawarkan "Coba lagi" */
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
  const error = failed || tilesDown || (!!ofs && !ready);
  const valid = ofs?.frames[idx];
  const wib = valid ? ofsValidWib(valid) : null;
  const nowIndex = ofs?.nowIndex ?? 0;
  // Kesegaran dari UMUR run (bukan flag fallback): probe yang nemu run 4 jam lalu itu segar;
  // run dari modelrun yang mandek 30 jam itu basi. Slot buta = tebakan → selalu ditandai.
  const stale = ready && ((ofs?.ageH ?? 0) > OFS_STALE_H || ofs?.source === "blind");
  const expired = !!ofs?.expired;

  const date =
    failed && !ready
      ? offline
        ? "Lagi offline — nunggu sinyal"
        : "Data gelombang BMKG lagi gangguan"
      : tilesDown
        ? "Tile gelombang BMKG gagal dimuat di perangkat ini"
        : expired
          ? "Data gelombang BMKG belum diperbarui"
          : ready
            ? `Gelombang BMKG${wib ? ` · ${wib.date}` : ""}${stale ? ` · run ${ofs?.ageH} jam lalu` : ""}${
                maskOk === false ? " · mask darat gagal, warna di atas pulau bukan data" : ""
              }`
            : "Memuat prakiraan…";

  const state = error
    ? "Gangguan"
    : expired
      ? "Kedaluwarsa"
      : ready && idx < nowIndex
        ? "Sudah lewat"
        : ready && idx === nowIndex
          ? "Sekarang"
          : "Prakiraan";

  return {
    count,
    ready,
    error,
    valid,
    wib,
    nowIndex,
    stale,
    date,
    state,
    opacity: maskOk === false ? 0.45 : 1,
    sliderText: wib ? `${wib.time} WIB, ${wib.date}` : "",
    canRetry: failed && !ready && !offline,
  };
}

/** Baris prakiraan teks BMKG untuk perairan Batam + peringatan dini (kalau ada). */
export function perairanLine(p: PerairanResponse | null): { text: string; warning: string } | null {
  const e = p?.current;
  if (!p || !e) return null;
  const wind =
    e.windMinKt !== null && e.windMaxKt !== null
      ? ` · angin ${e.windMinKt}–${e.windMaxKt} kt dari ${e.windFrom.toLowerCase()}`
      : "";
  return {
    text: `BMKG: ${e.waveCat.toLowerCase()} ${fmtWave(e.waveDesc)}${wind}${p.upcoming ? " (periode berikutnya)" : ""}`,
    warning: e.warning,
  };
}
