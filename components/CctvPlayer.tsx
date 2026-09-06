"use client";

import { useEffect, useRef, useState } from "react";
import { CCTV_CREDIT, streamUrl, type Cam } from "@/lib/cctv";

// ---------------------------------------------------------------------------
// Pemutar CCTV (HLS) — SATU stream saja, hidup cuma selama panel kebuka.
//
// Disiplin bandwidth (penting, baca sebelum ngutak-atik):
// stream ini ~2,3 Mbit/s (≈1 GB/jam) dan yang nanggung server sumber, BUKAN kita.
// Jadi: nggak ada grid, nggak ada autoplay banyak kamera, nggak ada prefetch.
// Player cuma di-mount pas user klik pin, dan WAJIB di-destroy pas ditutup.
// ---------------------------------------------------------------------------

type Props = { cam: Cam; onClose: () => void };

// "blocked" = data kamera SEHAT tapi browser nolak autoplay (butuh gestur user).
// Ini BUKAN error — jangan disamakan, dulu sempat kejadian streamnya jalan tapi
// UI-nya bilang "nggak bisa diakses" cuma gara-gara play() ditolak.
type State = "loading" | "playing" | "blocked" | "error";

export default function CctvPlayer({ cam, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State>("loading");

  // Esc buat nutup + fokus awal ke tombol tutup (a11y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const url = streamUrl(cam.slug);
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    const onPlaying = () => setState("playing");
    const onPause = () => setState((s) => (s === "playing" ? "blocked" : s));
    // Cuma error kalau elemen video BENERAN lapor error, bukan sekadar pause.
    const onErr = () => setState("error");
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onErr);

    // play() ditolak (kebijakan autoplay) BUKAN kegagalan stream — tampilkan
    // tombol putar, biar user tinggal ketuk sekali.
    const tryPlay = () => video.play().catch(() => setState("blocked"));

    // Urutan penting: hls.js DULU, native belakangan.
    // Chromium jawab canPlayType("application/vnd.apple.mpegurl") = "maybe"
    // padahal pemutaran HLS-nya nggak andal — kalau native didahulukan, stream
    // ke-buffer tapi nyangkut. Native cuma dipakai kalau MSE nggak ada
    // (iOS Safari), dan di sana native memang jalur yang benar.
    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          const h = new Hls({ lowLatencyMode: false, backBufferLength: 10 });
          hls = h;
          h.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) setState("error");
          });
          h.loadSource(url);
          h.attachMedia(video);
          h.on(Hls.Events.MANIFEST_PARSED, tryPlay);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          tryPlay();
        } else {
          setState("error");
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Modul gagal dimuat → masih ada peluang lewat native.
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          tryPlay();
        } else {
          setState("error");
        }
      });

    // Bongkar total pas ditutup — ini yang bikin tarikan ke server sumber berhenti.
    return () => {
      cancelled = true;
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onErr);
      try {
        hls?.destroy();
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        /* abaikan */
      }
    };
  }, [cam.slug]);

  return (
    <div className="cctv-backdrop" onClick={onClose}>
      <div
        className="cctv-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Kamera ${cam.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cctv-head">
          <div className="cctv-title">
            <div className="cctv-name">{cam.name}</div>
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
          <video
            ref={videoRef}
            className="cctv-video"
            playsInline
            muted
            autoPlay
            controls
            preload="none"
          />
          {state === "loading" && <div className="cctv-overlay">Menyambung ke kamera…</div>}
          {state === "error" && (
            <div className="cctv-overlay">Kamera lagi nggak bisa diakses</div>
          )}
          {state === "blocked" && (
            <button
              className="cctv-overlay cctv-play"
              onClick={() => videoRef.current?.play().catch(() => setState("error"))}
              aria-label="Putar kamera"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
              Ketuk untuk memutar
            </button>
          )}
        </div>

        <div className="cctv-foot">
          <span className="cctv-live">
            <span className="dot" /> Langsung
          </span>
          <span className="cctv-credit">{CCTV_CREDIT}</span>
        </div>
      </div>
    </div>
  );
}
