"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  DEFAULT_VIEW,
  LEGEND,
  MAX_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  PLACES,
  RADAR_BOUNDS,
  TILES,
  VIEWS,
  VIEW_PADDING,
  timeBasedTheme,
  type Frame,
  type ThemeMode,
  type ViewKey,
} from "@/lib/radar";

const REFRESH_MS = 5 * 60 * 1000;
const PLAY_MS = 650;
const THEME_KEY = "hujan-theme";

// Terbangkan peta ke preset view tiap kali view berubah.
function ViewController({ view }: { view: ViewKey }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // posisi awal udah diset MapContainer (bounds + padding)
      return;
    }
    map.flyToBounds(VIEWS[view].bounds, { ...VIEW_PADDING, duration: 0.8 });
  }, [view, map]);
  return null;
}

const IconSun = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const IconMoon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

export default function RadarMap() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [view, setView] = useState<ViewKey>(DEFAULT_VIEW);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  const followRef = useRef(true);
  const themeOverride = useRef<ThemeMode | null>(null);

  // Tema awal: pakai override tersimpan kalau ada, kalau nggak ikut jam WIB.
  // Komponen ini client-only (dynamic ssr:false) jadi aman baca localStorage di initializer.
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const s = localStorage.getItem(THEME_KEY);
      if (s === "light" || s === "dark") {
        themeOverride.current = s;
        return s;
      }
    } catch {
      /* abaikan */
    }
    return timeBasedTheme();
  });

  const loadFrames = useCallback(async () => {
    try {
      const res = await fetch("/api/frames");
      if (!res.ok) throw new Error("bad");
      const data: { frames: Frame[] } = await res.json();
      if (data.frames?.length) {
        setFrames(data.frames);
        if (followRef.current) setIdx(data.frames.length - 1);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
    // tema auto: ikut perubahan siang/malam selama user belum override manual
    if (!themeOverride.current) setTheme(timeBasedTheme());
  }, []);

  useEffect(() => {
    loadFrames();
    const t = setInterval(loadFrames, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadFrames]);

  useEffect(() => {
    frames.forEach((f) => {
      const img = new window.Image();
      img.src = f.url;
    });
  }, [frames]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % frames.length), PLAY_MS);
    return () => clearInterval(t);
  }, [playing, frames.length]);

  function toggleTheme() {
    setTheme((t) => {
      const next: ThemeMode = t === "dark" ? "light" : "dark";
      themeOverride.current = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* abaikan */
      }
      return next;
    });
  }

  const current = frames[idx];
  const isLatest = frames.length > 0 && idx === frames.length - 1;
  const ready = frames.length >= 2;

  return (
    <div data-theme={theme} style={{ position: "absolute", inset: 0 }}>
      <MapContainer
        bounds={VIEWS[DEFAULT_VIEW].bounds}
        boundsOptions={VIEW_PADDING}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={0.7}
        zoomControl={false}
        attributionControl={false}
        style={{ position: "absolute", inset: 0 }}
      >
        <TileLayer key={theme} url={TILES[theme]} subdomains={["a", "b", "c", "d"]} maxZoom={20} />
        {current && (
          <ImageOverlay url={current.url} bounds={RADAR_BOUNDS} opacity={opacity} zIndex={300} />
        )}
        {PLACES.map((p) => (
          <CircleMarker
            key={p.name}
            center={[p.lat, p.lng]}
            radius={2.5}
            pathOptions={{ color: "#6b7280", weight: 1, fillColor: "#ffffff", fillOpacity: 1 }}
          >
            <Tooltip permanent direction="right" offset={[6, 0]} className="place-label">
              {p.name}
            </Tooltip>
          </CircleMarker>
        ))}
        <ViewController view={view} />
      </MapContainer>

      <div className="scrim-top" />

      <header className="topbar">
        <div className="brand">
          <span className="mark">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.5c3.6 4.3 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.4-6.5 6-10.8Z" />
            </svg>
          </span>
          <div>
            <div className="name">
              Hujan <i>di</i> Batam
            </div>
            <div className="sub">Radar hujan · Batam &amp; sekitarnya</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="live-pill">
            <span className="dot" /> Langsung
          </span>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
          >
            {theme === "dark" ? IconSun : IconMoon}
          </button>
        </div>
      </header>

      <section className="panel" aria-label="Kontrol radar">
        <div className="status">
          <div>
            <div className="time">
              {current ? current.time : "—"}
              <span className="wib">WIB</span>
            </div>
            <div className="date">
              {status === "error"
                ? "Gagal memuat radar"
                : current
                  ? current.date
                  : "Memuat data…"}
            </div>
          </div>
          <div className="state">
            <span
              className="d"
              style={{ background: isLatest ? "var(--live-dot)" : "#f59e0b" }}
            />
            {isLatest ? "Citra terakhir" : "Putar ulang"}
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Pilih cakupan">
          {(Object.keys(VIEWS) as ViewKey[]).map((k) => (
            <button
              key={k}
              className={`seg-btn ${view === k ? "active" : ""}`}
              onClick={() => setView(k)}
              role="tab"
              aria-selected={view === k}
            >
              {VIEWS[k].label}
              <span className="k">{VIEWS[k].sub}</span>
            </button>
          ))}
        </div>

        <div className="transport">
          <button
            className="play"
            onClick={() => setPlaying((p) => !p)}
            disabled={!ready}
            aria-label={playing ? "Jeda animasi" : "Putar animasi"}
            style={{ opacity: ready ? 1 : 0.5 }}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <input
            className="rng"
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={idx}
            disabled={!ready}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPlaying(false);
              setIdx(v);
              followRef.current = v >= frames.length - 1;
            }}
          />
        </div>

        <div className="meta">
          <label className="opacity">
            Transparansi
            <input
              className="rng"
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>
          <div className="legend">
            <span className="lab">Ringan</span>
            <div className="bar">
              {LEGEND.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
            <span className="lab">Ekstrem</span>
          </div>
        </div>

        <div className="credit">
          Sumber citra radar:{" "}
          <a
            href="https://www.weather.gov.sg/weather-rain-area-240km"
            target="_blank"
            rel="noopener noreferrer"
          >
            Meteorological Service Singapore
          </a>{" "}
          · diperbarui tiap 15 menit
        </div>
      </section>
    </div>
  );
}
