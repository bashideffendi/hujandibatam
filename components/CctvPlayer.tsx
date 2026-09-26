"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ErrorData } from "hls.js";
import { CCTV_CREDIT, CCTV_MB_PER_MIN, checkCam, loadHls, streamUrl, type Cam, type CamCheck } from "@/lib/cctv";

// ---------------------------------------------------------------------------
// Pemutar CCTV (HLS = HTTP Live Streaming) — SATU stream saja, hidup cuma selama panel kebuka.
//
// Disiplin bandwidth (penting, baca sebelum ngutak-atik):
// stream ini ~2,4 Mbit/s (≈1 GB/jam) dan yang nanggung server sumber, BUKAN kita.
// Jadi: nggak ada grid, nggak ada autoplay banyak kamera, nggak ada prefetch video.
// Yang boleh: SATU playlist teks (~250 B) buat ngecek kameranya hidup — kalau mati/
// beku, NOL byte video ditarik. Player di-destroy pas ditutup, dan BERHENTI narik
// saat tab disembunyikan.
//
// Alur: checking (playlist + chunk hls.js paralel) → connecting (manifest) →
// fetching (segmen pertama ±3 MB) → playing. Gagal punya sebab & pesan sendiri-sendiri,
// plus tangga pemulihan (retry startLoad / recoverMediaError) sebelum menyerah.
// ---------------------------------------------------------------------------

type Props = {
  cam: Cam;
  onClose: () => void;
  /** Dipanggil kalau kamera terbukti mati/beku/hilang — buat menandai pin. */
  onDead?: (slug: string, lastSeen: number | null) => void;
  /** false = tampilkan tombol putar dulu, jangan tarik apa pun (mis. dibuka dari link ?cam=). */
  autoStart?: boolean;
};

type State =
  | "idle"
  | "checking"
  | "connecting"
  | "fetching"
  | "playing"
  | "buffering"
  | "paused"
  | "blocked"
  | "dead"
  | "error";

type Verdict = CamCheck["verdict"];

const fmtLastSeen = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms)) + " WIB";

const DEAD_COPY: Record<Exclude<Verdict, "ok" | "diam" | "server">, string> = {
  mati: "Kamera ini lagi mati — server berhenti menyiarkannya",
  beku: "Kamera ini beku — gambarnya nggak diperbarui",
  hilang: "Kamera ini nggak ada di server (mungkin dipindah/dihapus)",
};

export default function CctvPlayer({ cam, onClose, onDead, autoStart = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const onDeadRef = useRef(onDead);
  onCloseRef.current = onClose;
  onDeadRef.current = onDead;
  const titleId = useId();

  const [started, setStarted] = useState(autoStart);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>(autoStart ? "checking" : "idle");
  const [note, setNote] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [deadInfo, setDeadInfo] = useState<{ verdict: Verdict; lastSeen: number | null } | null>(null);

  // Fokus: simpan elemen sebelumnya, fokus ke Tutup, kembalikan saat modal ditutup. Sekali saja.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      prev?.focus?.();
    };
  }, []);

  // Esc buat nutup + Tab dikurung di dalam modal (aria-modal cuma nyembunyiin dari SR,
  // keyboard masih bisa Tab ke peta di belakang).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusables = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, video, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !started) return;
    const url = streamUrl(cam.slug);
    type HlsInstance = InstanceType<Awaited<ReturnType<typeof loadHls>>["default"]>;
    let hls: HlsInstance | null = null;
    let cancelled = false;
    const ctrl = new AbortController();
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      const t = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(t);
    };
    let hasPlayed = false;
    let firstFrag = false;
    let netRetries = 0;
    let mediaRecovered = false;
    let nonFatal: number[] = [];
    const t0 = performance.now();
    const debug = /[?&]debug=cctv/.test(window.location.search);
    const mark = (k: string) => {
      if (debug) console.debug(`[cctv ${cam.slug}] ${k} @ ${Math.round(performance.now() - t0)} ms`);
    };

    setState("checking");
    setNote(null);
    setShowRetry(false);
    setDeadInfo(null);

    // play() ditolak (kebijakan autoplay) BUKAN kegagalan stream — tampilkan tombol
    // putar. Setelah pernah jalan, penolakan berikutnya juga bukan error.
    const tryPlay = () =>
      video.play().catch(() => {
        if (!cancelled && !hasPlayed) setState("blocked");
      });
    const fail = (msg: string) => {
      if (cancelled) return;
      setNote(msg);
      setShowRetry(true);
      setState("error");
    };
    const dead = (verdict: Verdict, lastSeen: number | null) => {
      if (cancelled) return;
      setDeadInfo({ verdict, lastSeen });
      setState("dead");
      onDeadRef.current?.(cam.slug, lastSeen);
    };

    // --- event <video> ---
    const onPlaying = () => {
      hasPlayed = true;
      firstFrag = true;
      netRetries = 0;
      mediaRecovered = false;
      setNote(null);
      setShowRetry(false);
      setState("playing");
      mark("playing");
    };
    const onPause = () => {
      // Pause manual/sistem SETELAH pernah jalan → cukup badge "Dijeda", kontrol native yang pegang.
      if (hasPlayed && !video.ended) setState((s) => (s === "playing" || s === "buffering" ? "paused" : s));
    };
    const onWaiting = () => {
      if (!hasPlayed) return;
      later(() => {
        if (!video.paused && !video.ended && video.readyState < 3) setState("buffering");
      }, 1500);
    };
    const onVideoError = () => {
      if (hls || cancelled) return; // jalur hls.js punya handler sendiri
      const code = video.error?.code;
      if (code === 4) dead("mati", null);
      else if (code === 3) fail("HP-nya kewalahan muter siaran ini.");
      else fail(hasPlayed ? "Koneksi ke kamera putus." : "Nggak bisa nyambung ke kamera.");
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("error", onVideoError);

    // Watchdog: 10 detik tanpa potongan pertama → kabari, jangan diam. Loading tetap jalan.
    later(() => {
      if (!firstFrag) {
        setNote("Jaringannya lagi berat, masih dicoba…");
        setShowRetry(true);
      }
    }, 10000);
    // Nyendat kelamaan setelah pernah jalan → jujur bilang macet.
    let stallTimer: number | null = null;
    const armStall = () => {
      if (stallTimer !== null) return;
      stallTimer = window.setTimeout(() => {
        stallTimer = null;
        if (cancelled || video.paused) return;
        if (video.readyState < 3) {
          setNote("Siaran macet — kamera berhenti ngirim gambar atau sinyal putus.");
          setShowRetry(true);
        }
      }, 20000);
      timers.push(stallTimer);
    };
    const onProgress = () => {
      if (stallTimer !== null) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };
    video.addEventListener("timeupdate", onProgress);
    const stallObserver = () => {
      if (hasPlayed && !video.paused) armStall();
    };
    video.addEventListener("waiting", stallObserver);

    // Tab disembunyikan / app ke background → BERHENTI narik (bandwidth Pemko), pause.
    // Balik lagi → lompat ke live edge.
    const onVis = () => {
      if (cancelled) return;
      if (document.hidden) {
        hls?.stopLoad();
        video.pause();
      } else {
        if (hls) {
          hls.startLoad(-1);
          if (hasPlayed) tryPlay();
        } else if (hasPlayed) {
          video.src = url; // jalur native: buffer lama basi, set ulang
          tryPlay();
        }
      }
    };
    const onHide = () => {
      hls?.stopLoad();
      video.pause();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);

    (async () => {
      const [hlsMod, check] = await Promise.allSettled([loadHls(), checkCam(cam.slug, ctrl.signal)]);
      if (cancelled) return;
      mark("check+chunk");
      const v: CamCheck = check.status === "fulfilled" ? check.value : { verdict: "diam", lastSeen: null };
      if (v.verdict === "mati" || v.verdict === "beku" || v.verdict === "hilang") {
        dead(v.verdict, v.lastSeen);
        return; // NOL byte video
      }
      if (v.verdict === "server") {
        fail("Server kameranya lagi gangguan.");
        return;
      }
      // "diam" (timeout/offline) TIDAK memvonis kamera — tetap coba.
      setState("connecting");

      const HlsCtor = hlsMod.status === "fulfilled" ? hlsMod.value.default : null;
      const nativeOk = video.canPlayType("application/vnd.apple.mpegurl") !== "";
      // iPhone (iOS ≥17.1) punya ManagedMediaSource tapi bukan MediaSource penuh: jalur
      // NATIVE Apple lebih andal di sana. Chromium menjawab "maybe" untuk canPlayType
      // padahal HLS native-nya nyangkut → di Chromium tetap hls.js dulu.
      const appleNative = nativeOk && !("MediaSource" in window);
      if (appleNative || !HlsCtor || !HlsCtor.isSupported()) {
        if (!nativeOk) {
          fail("Browser ini nggak bisa memutar siaran HLS.");
          return;
        }
        video.addEventListener(
          "loadedmetadata",
          () => {
            if (!cancelled) setState((s) => (s === "connecting" ? "fetching" : s));
          },
          { once: true },
        );
        video.addEventListener(
          "loadeddata",
          () => {
            firstFrag = true;
          },
          { once: true },
        );
        video.src = url;
        tryPlay();
        return;
      }

      const Hls = HlsCtor;
      // Semua field policy WAJIB lengkap: mergeConfig hls.js cuma spread dangkal —
      // kalau timeoutRetry/errorRetry kosong, retry mati diam-diam.
      const pol = (ttfb: number, load: number, tRetry: number, eRetry: number) => ({
        default: {
          maxTimeToFirstByteMs: ttfb,
          maxLoadTimeMs: load,
          timeoutRetry: { maxNumRetry: tRetry, retryDelayMs: 0, maxRetryDelayMs: 0 },
          errorRetry: { maxNumRetry: eRetry, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
        },
      });
      const h = new Hls({
        lowLatencyMode: false,
        backBufferLength: 10,
        maxBufferLength: 15, // jangan antre 30 dtk (≈9 MB) buat orang yang nutup setelah 5 dtk
        maxMaxBufferLength: 30,
        startFragPrefetch: true, // potongan pertama mulai turun begitu manifest ke-parse
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4, // wajib > liveSyncDurationCount
        liveMaxUnchangedPlaylistRefresh: 4,
        manifestLoadPolicy: pol(6000, 10000, 1, 1),
        playlistLoadPolicy: pol(6000, 10000, 2, 2),
        // 20 dtk per potongan 3 MB = butuh ≥1,2 Mbit/s; di bawah itu stream 2,4 Mbit/s memang mustahil real-time
        fragLoadPolicy: pol(8000, 20000, 1, 2),
      });
      hls = h;
      h.on(Hls.Events.MANIFEST_PARSED, () => {
        mark("manifest");
        setState((s) => (s === "connecting" ? "fetching" : s));
        tryPlay();
      });
      h.on(Hls.Events.FRAG_LOADED, () => {
        if (!firstFrag) {
          firstFrag = true;
          mark("frag1");
          setNote(null);
          setShowRetry(false);
        }
      });
      h.on(Hls.Events.ERROR, (_e, data: ErrorData) => {
        if (cancelled) return;
        if (!data.fatal) {
          const now = Date.now();
          nonFatal = nonFatal.filter((t) => now - t < 30000);
          nonFatal.push(now);
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR && hasPlayed) {
            setState("buffering");
            armStall();
          }
          if (nonFatal.length >= 3) setNote("Sinyal kamera terputus-putus.");
          return;
        }
        const code = data.response?.code ?? 0;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (code >= 400 && code < 500) {
            // 4xx nggak di-retry hls.js — dan memang jangan: kameranya yang nggak ada.
            dead(code === 404 ? "hilang" : "mati", null);
            return;
          }
          if (code >= 500) {
            fail("Server kameranya lagi gangguan.");
            return;
          }
          const timeout =
            data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
            data.details === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT;
          if (timeout && !firstFrag) {
            fail("Koneksimu lagi belum kuat buat siaran video ini (butuh ≥1,2 Mbit/s).");
            return;
          }
          if (netRetries < 2) {
            // kedip jaringan di tengah tontonan → nyambung ulang, tanpa buka-tutup modal
            const delay = netRetries === 0 ? 1000 : 3000;
            netRetries++;
            setState(hasPlayed ? "buffering" : "connecting");
            setNote("Koneksi kedip — nyambung ulang…");
            const go = () => {
              if (cancelled) return;
              h.startLoad(-1);
              tryPlay();
            };
            if (navigator.onLine === false) window.addEventListener("online", () => later(go, 200), { once: true });
            else later(go, delay);
            return;
          }
          fail(hasPlayed ? "Koneksi ke kamera putus." : "Nggak bisa nyambung ke kamera.");
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (!mediaRecovered) {
            mediaRecovered = true;
            h.recoverMediaError();
            tryPlay();
            return;
          }
          fail("HP-nya kewalahan muter siaran ini.");
          return;
        }
        fail("Siaran nggak bisa diputar.");
      });
      // Urutan: loadSource dulu, baru attachMedia.
      h.loadSource(url);
      h.attachMedia(video);
    })();

    // Bongkar total pas ditutup/ganti kamera — ini yang bikin tarikan ke server sumber berhenti.
    return () => {
      cancelled = true;
      ctrl.abort();
      for (const t of timers) clearTimeout(t);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("timeupdate", onProgress);
      video.removeEventListener("waiting", stallObserver);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      try {
        hls?.destroy();
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        /* abaikan */
      }
    };
  }, [cam.slug, attempt, started]);

  const retry = () => {
    setAttempt((n) => n + 1);
    setStarted(true);
  };

  const badge: { text: string; cls: string } =
    state === "playing"
      ? { text: "Langsung", cls: "is-live" }
      : state === "buffering"
        ? { text: "Nyendat", cls: "is-muted" }
        : state === "paused"
          ? { text: "Dijeda", cls: "is-muted" }
          : state === "dead"
            ? { text: "Mati", cls: "is-off" }
            : state === "error"
              ? { text: "Gangguan", cls: "is-off" }
              : state === "idle" || state === "blocked"
                ? { text: "Siap", cls: "is-muted" }
                : { text: "Menyambung", cls: "is-muted" };

  const statusText =
    state === "checking"
      ? "Ngecek kamera…"
      : state === "connecting"
        ? "Menyambung…"
        : state === "fetching"
          ? "Mengambil siaran… potongan pertama ±3 MB"
          : state === "playing"
            ? `Siaran ${cam.name} jalan`
            : state === "buffering"
              ? "Nyendat, nunggu data…"
              : state === "dead" && deadInfo
                ? DEAD_COPY[deadInfo.verdict as keyof typeof DEAD_COPY] ?? "Kamera lagi mati"
                : state === "error"
                  ? (note ?? "Kamera lagi nggak bisa diakses")
                  : "";

  const showLoading = state === "checking" || state === "connecting" || state === "fetching";

  return (
    <div className="cctv-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className="cctv-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cctv-head">
          <div className="cctv-title">
            <h2 className="cctv-name" id={titleId}>
              {cam.name}
            </h2>
            <div className="cctv-sub">
              {cam.area}
              {cam.approx && " · posisi perkiraan"}
            </div>
          </div>
          <button ref={closeRef} className="cctv-close" onClick={onClose} aria-label="Tutup kamera">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="cctv-stage">
          <video ref={videoRef} className="cctv-video" playsInline muted autoPlay controls />

          {showLoading && (
            <div className="cctv-overlay">
              <div className="cctv-stage-text">{statusText}</div>
              {note && <div className="cctv-note">{note}</div>}
              {showRetry && (
                <button className="cctv-retry" onClick={retry}>
                  Coba lagi
                </button>
              )}
            </div>
          )}

          {state === "buffering" && (
            <div className="cctv-chip" aria-hidden>
              Nyendat…
            </div>
          )}

          {(state === "idle" || state === "blocked") && (
            <button
              className="cctv-overlay cctv-play"
              onClick={() => {
                if (!started) setStarted(true);
                else videoRef.current?.play().catch(() => setState("blocked"));
              }}
              aria-label="Putar kamera"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
              Ketuk untuk memutar
              {!started && <span className="cctv-note">Siaran video ≈{CCTV_MB_PER_MIN} MB per menit</span>}
            </button>
          )}

          {state === "dead" && deadInfo && (
            <div className="cctv-overlay">
              <div className="cctv-stage-text">{DEAD_COPY[deadInfo.verdict as keyof typeof DEAD_COPY]}</div>
              <div className="cctv-note">
                {deadInfo.lastSeen ? `Terakhir kirim gambar ${fmtLastSeen(deadInfo.lastSeen)}. ` : ""}
                Coba kamera lain di sekitar situ.
              </div>
              <button className="cctv-retry" onClick={retry}>
                Cek lagi
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="cctv-overlay">
              <div className="cctv-stage-text">{note ?? "Kamera lagi nggak bisa diakses"}</div>
              <button className="cctv-retry" onClick={retry}>
                Coba lagi
              </button>
            </div>
          )}
        </div>

        <div className="cctv-foot">
          <span className={`cctv-live ${badge.cls}`}>
            <span className="dot" /> {badge.text}
          </span>
          <span className="cctv-credit">
            {CCTV_CREDIT} · ≈{CCTV_MB_PER_MIN} MB/menit
          </span>
        </div>
        <div className="sr-only" role="status" aria-live="polite">
          {statusText}
        </div>
      </div>
    </div>
  );
}
