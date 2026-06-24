"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Pane,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  DEFAULT_VIEW,
  LEGEND,
  MAX_ZOOM,
  MIN_ZOOM,
  OFS_SWH_COLORS,
  OFS_TILE,
  PLACES,
  RADAR_BOUNDS,
  TILES,
  VIEWS,
  ofsValidWib,
  timeBasedTheme,
  type Frame,
  type Mode,
  type ThemeMode,
  type ViewKey,
} from "@/lib/radar";
import IosInstallHint from "./IosInstallHint";
import LandMask from "./LandMask";

const REFRESH_MS = 2 * 60 * 1000; // refetch frame & kondisi tiap 2 mnt (radar terbit tiap 5 mnt)
const PLAY_MS = 650;
const OFS_PLAY_MS = 1100; // animasi timeline gelombang lebih pelan dari radar
const THEME_KEY = "hujan-theme";
const MODE_KEY = "hujan-mode";

// Gradien legend OFS (colormap swh resmi BMKG, 0–7 m) — string CSS dibikin sekali.
const OFS_GRADIENT = `linear-gradient(to right, ${OFS_SWH_COLORS.map(
  (s) => `${s.c} ${Math.round((s.m / 7) * 100)}%`,
).join(", ")})`;

type Padding = { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] };

// Fit peta ke bounding box view, dengan padding dinamis sesuai tinggi panel asli.
// Fit ulang juga saat resize/rotasi layar — penting di HP (panel bisa lebih tinggi).
function MapController({
  view,
  getPadding,
  collapsed,
  mode,
}: {
  view: ViewKey;
  getPadding: () => Padding;
  collapsed: boolean;
  mode: Mode;
}) {
  const map = useMap();
  const mounted = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  // Mode OMBAK: izinkan zoom-out lebih jauh (gak ada radar yg pecah) biar field laut
  // jauh (Natuna/Anambas) keliatan utuh. Mode HUJAN tetap dikunci ke jangkauan radar.
  useEffect(() => {
    map.setMinZoom(mode === "ombak" ? 5 : MIN_ZOOM);
  }, [mode, map]);

  // view berubah (+ mount): fit/terbang ke wilayah
  useEffect(() => {
    const opts = getPadding();
    if (!mounted.current) {
      mounted.current = true;
      map.invalidateSize();
      map.fitBounds(VIEWS[view].bounds, opts);
    } else {
      map.flyToBounds(VIEWS[view].bounds, { ...opts, duration: 0.8 });
    }
  }, [view, map, getPadding]);

  // panel ditutup/dibuka -> tinggi panel berubah -> re-frame halus pakai ruang baru
  const firstCollapse = useRef(true);
  useEffect(() => {
    if (firstCollapse.current) {
      firstCollapse.current = false;
      return;
    }
    map.flyToBounds(VIEWS[viewRef.current].bounds, { ...getPadding(), duration: 0.4 });
  }, [collapsed, map, getPadding]);

  // resize/rotasi layar
  useEffect(() => {
    const refit = () => {
      map.invalidateSize();
      map.fitBounds(VIEWS[viewRef.current].bounds, getPadding());
    };
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, [map, getPadding]);

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

type Conditions = {
  aq: { psi: number; pm25: number | null; label: string; color: string } | null;
  wind: { speed: number; deg: number; label: string; station?: string } | null;
  rain: { mm: number; station: string } | null;
  uv: { value: number; label: string; color: string } | null;
};

type OfsData = { baserun: string | null; frames: string[]; nowIndex: number };

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export default function RadarMap() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [view, setView] = useState<ViewKey>(DEFAULT_VIEW);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [conditions, setConditions] = useState<Conditions | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("hujan-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const [stale, setStale] = useState(false);
  const [conditionsError, setConditionsError] = useState(false);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);

  // Mode tampilan: HUJAN (radar) vs OMBAK (field gelombang OFS BMKG). State ombak
  // (idx/opacity) terpisah dari radar biar balik mode posisi masing-masing tetap.
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === "ombak" ? "ombak" : "hujan";
    } catch {
      return "hujan";
    }
  });
  const [ofs, setOfs] = useState<OfsData | null>(null);
  const [ofsIdx, setOfsIdx] = useState(0);
  const [waveOpacity, setWaveOpacity] = useState(0.85);

  const followRef = useRef(true);
  const themeOverride = useRef<ThemeMode | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const preloadedRef = useRef<Set<string>>(new Set());
  const ofsManualRef = useRef(false); // user scrub manual → jangan auto-realign tiap refetch

  // Padding fit dinamis: ukur tinggi panel asli (di HP panel bisa lebih tinggi karena
  // konten wrap) biar wilayah selalu ke-frame penuh DI ATAS panel, nggak ketutup.
  const getPadding = useCallback(() => {
    const h = panelRef.current?.offsetHeight ?? 220;
    return {
      paddingTopLeft: [14, 72] as [number, number],
      paddingBottomRight: [14, Math.round(h) + 24] as [number, number],
    };
  }, []);

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
      const res = await fetch("/api/frames", { cache: "no-store" });
      if (!res.ok) throw new Error("bad");
      const data: { frames: Frame[]; stale?: boolean } = await res.json();
      if (data.frames?.length) {
        setFrames(data.frames);
        setStale(Boolean(data.stale));
        setIdx((prev) =>
          followRef.current ? data.frames.length - 1 : Math.min(prev, data.frames.length - 1),
        );
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

  const loadConditions = useCallback(async () => {
    try {
      const res = await fetch("/api/conditions", { cache: "no-store" });
      if (!res.ok) throw new Error("bad");
      setConditions(await res.json());
      setConditionsError(false);
    } catch {
      setConditionsError(true);
    }
  }, []);

  useEffect(() => {
    loadConditions();
    const t = setInterval(loadConditions, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadConditions]);

  const loadOfs = useCallback(async (resetIdx: boolean) => {
    try {
      const res = await fetch("/api/ofs-frame", { cache: "no-store" });
      if (!res.ok) throw new Error("bad");
      const d: OfsData = await res.json();
      setOfs(d);
      // Buka di frame yg nutupin jam-sekarang, KECUALI user lagi scrub manual (biar
      // reopen PWA sesudah lewat waktu nggak nyangkut di frame lama).
      if ((resetIdx || !ofsManualRef.current) && d.frames?.length) {
        setOfsIdx(Math.max(0, Math.min(d.frames.length - 1, d.nowIndex)));
      }
    } catch {
      /* graceful: layer ombak nggak muncul */
    }
  }, []);

  // Masuk mode OMBAK & belum ada data → ambil frame OFS.
  useEffect(() => {
    if (mode === "ombak" && !ofs) loadOfs(true);
  }, [mode, ofs, loadOfs]);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* abaikan */
    }
  }, [mode]);

  // App balik kelihatan (reopen PWA / balik ke tab / restore dari bfcache) -> fetch
  // ulang. Penting buat PWA standalone yang nggak punya tombol refresh.
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === "visible") {
        loadFrames();
        loadConditions();
        if (mode === "ombak") loadOfs(false);
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refetch();
    };
    document.addEventListener("visibilitychange", refetch);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", refetch);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [loadFrames, loadConditions, loadOfs, mode]);

  useEffect(() => {
    frames.forEach((f) => {
      if (preloadedRef.current.has(f.url)) return;
      preloadedRef.current.add(f.url);
      const img = new window.Image();
      img.src = f.url;
    });
  }, [frames]);

  const ofsCount = ofs?.frames.length ?? 0;
  useEffect(() => {
    if (!playing) return;
    if (mode === "hujan") {
      if (frames.length < 2) return;
      const t = setInterval(() => setIdx((i) => (i + 1) % Math.max(1, frames.length)), PLAY_MS);
      return () => clearInterval(t);
    }
    // OMBAK: sweep timeline forecast SEKALI lalu berhenti (tile reload tiap step,
    // jangan loop biar gak terus-terusan narik tile).
    if (ofsCount < 2) return;
    const t = setInterval(() => {
      setOfsIdx((i) => {
        if (i >= ofsCount - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, OFS_PLAY_MS);
    return () => clearInterval(t);
  }, [playing, mode, frames.length, ofsCount]);

  useEffect(() => {
    try {
      localStorage.setItem("hujan-collapsed", collapsed ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }, [collapsed]);

  // Tangkap prompt install PWA (Chrome) → tampilin tombol "Pasang" manual.
  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function doInstall() {
    if (!installEvt) return;
    try {
      await installEvt.prompt();
      await installEvt.userChoice;
    } catch {
      /* abaikan */
    }
    setInstallEvt(null);
  }

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

  function switchMode(next: Mode) {
    if (next === mode) return;
    setPlaying(false);
    if (next === "hujan") {
      ofsManualRef.current = false; // keluar ombak → boleh auto-realign frame lagi
      if (view === "natuna") setView("regional"); // view "Natuna" cuma valid di mode ombak
    }
    setMode(next);
  }

  const current = frames[idx];
  const isLatest = frames.length > 0 && idx === frames.length - 1;
  const ready = frames.length >= 2;
  const viewKeys: ViewKey[] =
    mode === "ombak" ? ["batam", "regional", "kepri", "natuna"] : ["batam", "regional", "kepri"];
  const ofsReady = ofsCount > 0;
  const ofsValid = ofs?.frames[ofsIdx];
  const ofsWib = ofsValid ? ofsValidWib(ofsValid) : null;
  const ofsIsNow = ofsReady && ofsIdx === (ofs?.nowIndex ?? 0);

  return (
    <div data-theme={theme} style={{ position: "absolute", inset: 0 }}>
      <MapContainer
        center={[0.9, 104.0]}
        zoom={9}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomControl={false}
        attributionControl={false}
        style={{ position: "absolute", inset: 0 }}
      >
        <AttributionControl position="bottomright" prefix={false} />
        <TileLayer
          key={theme}
          url={TILES[theme]}
          subdomains={["a", "b", "c", "d"]}
          maxZoom={20}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> &middot; Radar: MSS &middot; Cuaca: data.gov.sg/NEA &middot; Laut: BMKG'
        />
        {mode === "hujan" && current && (
          <ImageOverlay url={current.url} bounds={RADAR_BOUNDS} opacity={opacity} zIndex={300} />
        )}
        {/* Field gelombang OFS (TMS tile contourf BMKG) di atas basemap */}
        {mode === "ombak" && ofs?.baserun && ofsValid && (
          <TileLayer
            url={OFS_TILE(ofs.baserun, ofsValid)}
            tms
            opacity={waveOpacity}
            zIndex={250}
            maxNativeZoom={8}
            maxZoom={20}
          />
        )}
        {/* Mask daratan (fill = warna land basemap) di atas field → darat nol-tint, laut field */}
        {mode === "ombak" && <LandMask theme={theme} />}
        {/* Label kota/negara di atas mask (basemap asli ketutup field+mask) */}
        {mode === "ombak" && (
          <Pane name="ombak-labels" style={{ zIndex: 270, pointerEvents: "none" }}>
            <TileLayer
              url={`https://{s}.basemaps.cartocdn.com/${
                theme === "dark" ? "dark_only_labels" : "light_only_labels"
              }/{z}/{x}/{y}{r}.png`}
              subdomains={["a", "b", "c", "d"]}
              maxZoom={20}
            />
          </Pane>
        )}
        {mode === "hujan" &&
          PLACES.map((p) => (
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
        <MapController view={view} getPadding={getPadding} collapsed={collapsed} mode={mode} />
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
          {installEvt && (
            <button
              className="install-btn"
              onClick={doInstall}
              aria-label="Pasang aplikasi ke layar utama"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 3v12M7 11l5 4 5-4M5 21h14" />
              </svg>
              Pasang
            </button>
          )}
          {mode === "ombak" ? (
            <span className="live-pill forecast">
              <span className="dot" /> Prakiraan
            </span>
          ) : (
            <span className="live-pill" data-stale={stale ? "" : undefined}>
              <span className="dot" /> {stale ? "Tertunda" : "Langsung"}
            </span>
          )}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
          >
            {theme === "dark" ? IconSun : IconMoon}
          </button>
        </div>
      </header>

      <section
        className="panel"
        aria-label="Kontrol radar"
        ref={panelRef}
        data-collapsed={collapsed}
      >
        {!collapsed && (
          <button
            className="panel-handle"
            onClick={() => setCollapsed(true)}
            aria-label="Sembunyikan panel"
            aria-expanded={true}
          >
            <svg
              className="handle-chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}

        {collapsed ? (
          <button className="panel-mini" onClick={() => setCollapsed(false)}>
            <span
              className="mini-dot"
              style={{
                background:
                  mode === "ombak"
                    ? "var(--text-dim)"
                    : isLatest && !stale
                      ? "var(--live-dot)"
                      : "#f59e0b",
              }}
            />
            <span className="mini-time">
              {mode === "ombak" ? (ofsWib ? ofsWib.time : "—") : current ? current.time : "—"}
              <span className="wib">WIB</span>
            </span>
            <span className="mini-view">
              {mode === "ombak" ? `Ombak · ${VIEWS[view].label}` : VIEWS[view].label}
            </span>
            <svg
              className="mini-chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        ) : (
          <>
        <div className="panel-top">
        <div className="status">
          {mode === "ombak" ? (
            <>
              <div>
                <div className="time">
                  {ofsWib ? ofsWib.time : "—"}
                  <span className="wib">WIB</span>
                </div>
                <div className="date">
                  {ofsReady
                    ? `Gelombang BMKG${ofsWib ? ` · ${ofsWib.date}` : ""}`
                    : "Memuat prakiraan…"}
                </div>
              </div>
              <div className="state">
                <span className="d" style={{ background: "var(--text-dim)" }} />
                {ofsIsNow ? "Sekarang" : "Prakiraan"}
              </div>
            </>
          ) : (
            <>
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
                  style={{ background: isLatest && !stale ? "var(--live-dot)" : "#f59e0b" }}
                />
                {isLatest ? (stale ? "Data tertunda" : "Citra terakhir") : "Putar ulang"}
              </div>
            </>
          )}
        </div>

        {mode === "hujan" &&
          conditions &&
          (conditions.aq || conditions.wind || conditions.rain || conditions.uv) && (
          <div className="conditions">
            {conditions.rain && (
              <span
                className="chip"
                title={`Curah hujan 5 menit ${conditions.rain.mm} mm di ${conditions.rain.station} — stasiun Singapura terdekat (proxy leading-edge buat Batam)`}
              >
                <svg className="rain-ico" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 2.5c3.6 4.3 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.4-6.5 6-10.8Z" />
                </svg>
                Hujan <b>{conditions.rain.mm} mm</b>
                <span className="chip-sub">{conditions.rain.station}</span>
              </span>
            )}
            {conditions.aq && (
              <span
                className="chip"
                title={`PSI 24 jam ${conditions.aq.psi}${
                  conditions.aq.pm25 != null ? ` · PM2.5 ${conditions.aq.pm25}` : ""
                } — region Singapura selatan (proxy haze Batam)`}
              >
                <span className="chip-dot" style={{ background: conditions.aq.color }} />
                Udara <b>{conditions.aq.psi}</b>
                <span className="chip-sub">{conditions.aq.label}</span>
              </span>
            )}
            {conditions.uv && (
              <span
                className="chip"
                title={`Indeks UV jam ini ${conditions.uv.value} — potensi langit cerah (transferable ke Batam)`}
              >
                <svg
                  className="uv-ico"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={conditions.uv.color}
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="3.6" />
                  <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" />
                </svg>
                UV <b>{conditions.uv.value}</b>
                <span className="chip-sub">{conditions.uv.label}</span>
              </span>
            )}
            {conditions.wind && (
              <span
                className="chip"
                title={`Angin${conditions.wind.station ? ` · ${conditions.wind.station}` : ""}`}
              >
                <svg
                  className="wind-arrow"
                  viewBox="0 0 24 24"
                  style={{ transform: `rotate(${conditions.wind.deg + 180}deg)` }}
                  aria-hidden
                >
                  <path d="M12 3l5 8h-3v8h-4v-8H7z" />
                </svg>
                Angin <b>{conditions.wind.speed} kt</b>
                <span className="chip-sub">dari {conditions.wind.label}</span>
              </span>
            )}
          </div>
        )}

        {mode === "hujan" && conditionsError && !conditions && (
          <div className="conditions-err">Data cuaca tambahan lagi nggak tersedia</div>
        )}
        </div>

        <div className="mode-switch" role="group" aria-label="Pilih tampilan">
          <button
            className={`mode-btn ${mode === "hujan" ? "active" : ""}`}
            onClick={() => switchMode("hujan")}
            aria-pressed={mode === "hujan"}
          >
            <svg className="mode-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2.5c3.6 4.3 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.4-6.5 6-10.8Z" />
            </svg>
            Hujan
          </button>
          <button
            className={`mode-btn ${mode === "ombak" ? "active" : ""}`}
            onClick={() => switchMode("ombak")}
            aria-pressed={mode === "ombak"}
          >
            <svg
              className="mode-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M2 8.5c1.8 0 1.8 2 3.6 2s1.8-2 3.6-2 1.8 2 3.6 2 1.8-2 3.6-2 1.8 2 3.6 2" />
              <path d="M2 14c1.8 0 1.8 2 3.6 2s1.8-2 3.6-2 1.8 2 3.6 2 1.8-2 3.6-2 1.8 2 3.6 2" />
            </svg>
            Ombak
          </button>
        </div>

        <div
          className="segmented"
          role="group"
          aria-label="Pilih cakupan"
          style={{ gridTemplateColumns: `repeat(${viewKeys.length}, 1fr)` }}
        >
          {viewKeys.map((k) => (
            <button
              key={k}
              className={`seg-btn ${view === k ? "active" : ""}`}
              onClick={() => setView(k)}
              aria-pressed={view === k}
            >
              {VIEWS[k].label}
              <span className="k">{VIEWS[k].sub}</span>
            </button>
          ))}
        </div>

        <div className="transport">
          <button
            className="play"
            onClick={() =>
              setPlaying((p) => {
                // mulai sweep dari frame-sekarang kalau lagi mentok di akhir
                if (!p && mode === "ombak" && ofsIdx >= ofsCount - 1) setOfsIdx(ofs?.nowIndex ?? 0);
                return !p;
              })
            }
            disabled={mode === "hujan" ? !ready : !ofsReady}
            aria-label={playing ? "Jeda" : "Putar"}
            style={{ opacity: (mode === "hujan" ? ready : ofsReady) ? 1 : 0.5 }}
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
            aria-label={mode === "ombak" ? "Waktu prakiraan gelombang" : "Penggeser waktu citra hujan"}
            min={0}
            max={mode === "ombak" ? Math.max(0, ofsCount - 1) : Math.max(0, frames.length - 1)}
            value={mode === "ombak" ? ofsIdx : idx}
            disabled={mode === "ombak" ? !ofsReady : !ready}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPlaying(false);
              if (mode === "ombak") {
                ofsManualRef.current = true;
                setOfsIdx(v);
              } else {
                setIdx(v);
                followRef.current = v >= frames.length - 1;
              }
            }}
          />
        </div>

        <div className="meta">
          <label className="opacity">
            {mode === "ombak" ? "Tembus" : "Transparansi"}
            <input
              className="rng"
              type="range"
              aria-label={mode === "ombak" ? "Transparansi field gelombang" : "Transparansi overlay radar"}
              min={mode === "ombak" ? 0.3 : 0.3}
              max={mode === "ombak" ? 0.9 : 1}
              step={0.05}
              value={mode === "ombak" ? waveOpacity : opacity}
              onChange={(e) =>
                mode === "ombak"
                  ? setWaveOpacity(Number(e.target.value))
                  : setOpacity(Number(e.target.value))
              }
            />
          </label>
          {mode === "ombak" ? (
            <div className="legend">
              <span className="lab">Tenang</span>
              <div className="bar" style={{ background: OFS_GRADIENT }} />
              <span className="lab">Ekstrem</span>
            </div>
          ) : (
            <div className="legend">
              <span className="lab">Ringan</span>
              <div className="bar">
                {LEGEND.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </div>
              <span className="lab">Ekstrem</span>
            </div>
          )}
        </div>

        <div className="credit">
          Radar:{" "}
          <a
            href="https://www.weather.gov.sg/weather-rain-area-240km"
            target="_blank"
            rel="noopener noreferrer"
          >
            Meteorological Service Singapore
          </a>{" "}
          · Cuaca:{" "}
          <a href="https://data.gov.sg" target="_blank" rel="noopener noreferrer">
            data.gov.sg / NEA
          </a>{" "}
          · Laut:{" "}
          <a href="https://maritim.bmkg.go.id" target="_blank" rel="noopener noreferrer">
            BMKG OFS
          </a>{" "}
          · Peta: © OpenStreetMap, CARTO
        </div>
          </>
        )}
      </section>

      <IosInstallHint />
    </div>
  );
}
