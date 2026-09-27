"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Pane,
  TileLayer,
  Tooltip,
} from "react-leaflet";
import type { ConditionsResponse, ForecastResponse } from "@/lib/api-types";
import { CCTV_HOST, MAPPED_CAMS, loadHls, type Cam } from "@/lib/cctv";
import { isSmallLandscape, saveData } from "@/lib/client";
import { readInitialState } from "@/lib/initial-state";
import { PREF, writePref } from "@/lib/prefs";
import {
  CARTO_SUBDOMAINS,
  DEFAULT_VIEW,
  LABEL_TILES,
  MAX_ZOOM,
  MIN_ZOOM,
  PLACES,
  RADAR_BOUNDS,
  TILES,
  VIEWS,
  VIEW_KEYS,
  type Mode,
  type ViewKey,
} from "@/lib/radar";
import {
  echoLine,
  echoShort,
  forecastLine,
  ofsView,
  perairanLine,
  radarView,
  type Pill,
} from "@/lib/status";
import { useInstallPrompt, useNow, useOffline, useShare } from "@/hooks/useBrowser";
import { useOfs } from "@/hooks/useOfs";
import { useRevisit } from "@/hooks/usePolling";
import { useRadar } from "@/hooks/useRadar";
import { useResource } from "@/hooks/useResource";
import { useThemeMode } from "@/hooks/useThemeMode";
import CctvLayer from "./CctvLayer";
import CctvPlayer from "./CctvPlayer";
import IosInstallHint from "./IosInstallHint";
import MapController, { type Padding } from "./MapController";
import OfsField from "./OfsField";
import Panel from "./Panel";
import Topbar from "./Topbar";
import CctvBlock from "./panel/CctvBlock";
import Conditions from "./panel/Conditions";
import { ModeSwitch, Transport, ViewSelector } from "./panel/Controls";
import Credit from "./panel/Credit";
import { OfsLegend, RainMeta } from "./panel/Legends";
import { InfoLine, StatusBlock } from "./panel/Status";

// ---------------------------------------------------------------------------
// Orkestrator: merangkai hook data (hooks/*) dengan peta dan panel. Logika data ada di
// hook, aturan tampilan ada di lib/status.ts, potongan UI ada di components/panel/*.
// ---------------------------------------------------------------------------

// leaflet.vectorgrid (48 KB) cuma dibutuhkan mode OMBAK → jangan ikut chunk peta utama.
const LandMask = dynamic(() => import("./LandMask"), { ssr: false });

const TICK_MS = 30 * 1000; // label "X mnt lalu" dihitung ulang
const CONDITIONS_MS = 2 * 60 * 1000;
const FORECAST_MS = 30 * 60 * 1000; // prakiraan BMKG 3-jaman; server menahan 15–30 menit

const MODE_META: Record<Mode, { sub: string; panel: string }> = {
  hujan: { sub: "Radar hujan · Batam & sekitarnya", panel: "Kontrol radar hujan" },
  ombak: { sub: "Prakiraan ombak · Kepri", panel: "Kontrol prakiraan gelombang" },
  cctv: { sub: "CCTV lalu lintas · Kota Batam", panel: "Daftar kamera" },
};

const defaultView = (mode: Mode): ViewKey => (mode === "cctv" ? "batam" : DEFAULT_VIEW);

/** Param URL yang mewakili tampilan sekarang (?mode=&view=&cam=), hanya yang bukan default. */
function applyStateParams(p: URLSearchParams, mode: Mode, view: ViewKey, cam: Cam | null) {
  p.delete("mode");
  p.delete("view");
  p.delete("cam");
  if (mode !== "hujan") p.set("mode", mode);
  if (view !== defaultView(mode)) p.set("view", view);
  if (cam) p.set("cam", cam.slug);
  return p;
}

export default function RadarMap() {
  // Komponen ini client-only (dynamic ssr:false) jadi aman baca window/localStorage di initializer.
  const init = useMemo(readInitialState, []);

  const [mode, setMode] = useState<Mode>(init.mode);
  const [view, setView] = useState<ViewKey>(init.view);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [collapsed, setCollapsed] = useState(init.collapsed);
  const [detail, setDetail] = useState(init.detail);

  // CCTV: kamera yang lagi diputar (null = nggak ada stream jalan), kamera yang terbukti
  // mati di sesi ini, dan 3 kamera terakhir dibuka.
  const [activeCam, setActiveCam] = useState<Cam | null>(init.cam);
  const [camAutoStart, setCamAutoStart] = useState(!init.cam); // dari link → tombol putar dulu
  const [deadCams, setDeadCams] = useState<Map<string, number | null>>(() => new Map());
  const [recentCams, setRecentCams] = useState<Cam[]>(init.recentCams);

  const panelRef = useRef<HTMLElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ---- data ----
  const offline = useOffline();
  const tick = useNow(TICK_MS);
  const stopPlaying = useCallback(() => setPlaying(false), []);
  const radar = useRadar({ enabled: mode === "hujan", playing });
  const ofs = useOfs({ enabled: mode === "ombak", playing, onSweepEnd: stopPlaying });
  const conditions = useResource<ConditionsResponse>("/api/conditions", CONDITIONS_MS, mode === "hujan", false);
  const forecast = useResource<ForecastResponse>("/api/prakiraan", FORECAST_MS, mode === "hujan", true);

  const { theme, toggle: toggleTheme } = useThemeMode(
    init.theme,
    init.themeOverride,
    () => playing || !!activeCam,
  );
  const { canInstall, install } = useInstallPrompt();
  const { share, toast } = useShare();

  // App balik kelihatan / sinyal balik → muat ulang data mode yang aktif.
  useRevisit((reopen) => {
    if (mode === "hujan") {
      radar.load();
      conditions.load();
    } else if (mode === "ombak") {
      if (reopen) ofs.reopen();
      else ofs.load(false);
    }
  });

  // Padding fit dinamis: ukur tinggi panel & topbar asli biar wilayah selalu ke-frame penuh,
  // nggak ketutup. Landscape HP: panel jadi side-sheet kanan → padding-nya di kanan.
  const getPadding = useCallback((): Padding => {
    const panelH = panelRef.current?.offsetHeight ?? 220;
    const topH = topbarRef.current?.offsetHeight ?? 64;
    if (isSmallLandscape()) {
      const w = panelRef.current?.offsetWidth ?? 320;
      return { paddingTopLeft: [14, topH + 8], paddingBottomRight: [w + 24, 14] };
    }
    return { paddingTopLeft: [14, topH + 8], paddingBottomRight: [14, Math.round(panelH) + 24] };
  }, []);

  // ---- efek samping ----
  useEffect(() => {
    writePref(PREF.mode, mode);
    writePref(PREF.view, view);
    writePref(PREF.collapsed, collapsed ? "1" : "0");
    writePref(PREF.detail, detail ? "1" : "0");
  }, [mode, view, collapsed, detail]);

  // URL mencerminkan state (bisa dibagikan); param lain (mis. debug) dipertahankan.
  useEffect(() => {
    try {
      const q = applyStateParams(new URLSearchParams(window.location.search), mode, view, activeCam).toString();
      const next = `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(null, "", next);
      }
    } catch {
      /* abaikan */
    }
  }, [mode, view, activeCam]);

  // Keluar dari mode CCTV = matikan stream yang lagi jalan.
  useEffect(() => {
    if (mode !== "cctv") setActiveCam(null);
  }, [mode]);

  // Masuk mode CCTV: pemanasan — preconnect ke host Pemko (tanpa payload) + chunk hls.js
  // (aset kita sendiri). Nol byte video sebelum pin diketuk.
  useEffect(() => {
    if (mode !== "cctv") return;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = CCTV_HOST;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    if (!saveData()) loadHls().catch(() => {});
    return () => {
      link.remove();
    };
  }, [mode]);

  // Tinggi panel → CSS var (atribusi Leaflet di HP duduk DI ATAS panel, bukan tertimpa).
  useEffect(() => {
    const el = panelRef.current;
    const wrap = wrapperRef.current;
    if (!el || !wrap) return;
    const apply = () => wrap.style.setProperty("--panel-h", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- aksi ----
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setPlaying(false);
    // view "Natuna" cuma valid di mode ombak; semua kamera ada di Pulau Batam.
    if (next === "cctv") setView("batam");
    else if (!VIEW_KEYS[next].includes(view)) setView("regional");
    setMode(next);
  };

  const togglePlay = () => {
    if (!playing && mode === "ombak") ofs.rewindIfAtEnd();
    setPlaying((p) => !p);
  };

  const scrub = (v: number) => {
    setPlaying(false);
    if (mode === "ombak") ofs.scrub(v);
    else radar.scrub(v);
  };

  const closeCam = useCallback(() => {
    setActiveCam(null);
    setCamAutoStart(true);
  }, []);

  const pickCam = useCallback((cam: Cam) => {
    setCamAutoStart(true);
    setActiveCam(cam);
    setRecentCams((prev) => {
      const next = [cam, ...prev.filter((c) => c.slug !== cam.slug)].slice(0, 3);
      writePref(PREF.recentCams, JSON.stringify(next.map((c) => c.slug)));
      return next;
    });
  }, []);

  const onDead = useCallback((slug: string, lastSeen: number | null) => {
    setDeadCams((m) => {
      const n = new Map(m);
      n.set(slug, lastSeen);
      return n;
    });
  }, []);

  // ---- turunan tampilan ----
  const now = Math.max(tick, radar.loadedAt);
  const rv = radarView({
    frames: radar.frames,
    idx: radar.idx,
    status: radar.status,
    stale: radar.stale,
    offline,
    now,
    broken: radar.broken,
  });
  const echoText = echoLine(radar.echo, radar.frames, now, radar.status);
  const fcText = forecastLine(forecast.data);
  const ov = ofsView({
    ofs: ofs.ofs,
    idx: ofs.idx,
    failed: ofs.failed,
    tilesDown: ofs.tilesDown,
    maskOk: ofs.maskOk,
    offline,
  });
  const pLine = perairanLine(ofs.perairan);

  const pill: Pill =
    mode === "ombak"
      ? { text: "Prakiraan", kind: "muted" }
      : mode === "cctv"
        ? activeCam
          ? { text: "Langsung", kind: "live" }
          : { text: "Siaga", kind: "muted" }
        : rv.pill;

  const liveText =
    mode === "hujan"
      ? [rv.pill.text, rv.date, echoText].filter(Boolean).join(". ")
      : mode === "ombak"
        ? [ov.state, ov.date, pLine?.warning].filter(Boolean).join(". ")
        : "";

  const onShare = () => {
    const q = applyStateParams(new URLSearchParams(), mode, view, activeCam).toString();
    const url = `${window.location.origin}${window.location.pathname}${q ? `?${q}` : ""}`;
    const text =
      mode === "hujan"
        ? `Radar hujan Batam${rv.current ? ` ${rv.current.time} WIB` : ""}${
            radar.echo ? ` — ${echoShort(radar.echo)}` : ""
          }`
        : mode === "ombak"
          ? `Prakiraan ombak perairan Batam${pLine ? ` — ${pLine.text}` : ""}`
          : activeCam
            ? `CCTV ${activeCam.name}, Batam`
            : "CCTV lalu lintas Kota Batam";
    share({ title: "Hujan di Batam", text, url });
  };

  const modalOpen = !!activeCam;
  const current = rv.current;

  return (
    <div ref={wrapperRef} data-theme={theme} className="app-root" style={{ position: "absolute", inset: 0 }}>
      <div className="map-wrap" style={{ position: "absolute", inset: 0 }} inert={modalOpen}>
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
            subdomains={CARTO_SUBDOMAINS}
            maxZoom={20}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
          />
          {mode === "hujan" && current && !rv.currentBroken && (
            <ImageOverlay
              url={current.url}
              bounds={RADAR_BOUNDS}
              opacity={opacity}
              zIndex={300}
              attribution="Radar: Meteorological Service Singapore"
              eventHandlers={{ error: () => radar.markBroken(current.url) }}
            />
          )}
          {/* Field gelombang OFS (double-buffer, nggak berkedip) di atas basemap */}
          {mode === "ombak" && ofs.ofs?.baserun && ov.valid && (
            <OfsField
              baserun={ofs.ofs.baserun}
              valid={ov.valid}
              opacity={ov.opacity}
              onTilesDown={ofs.setTilesDown}
            />
          )}
          {/* Mask daratan (fill = warna land basemap) di atas field → darat nol-tint, laut field */}
          {mode === "ombak" && <LandMask theme={theme} onStatus={ofs.setMaskOk} />}
          {/* Label kota/negara di atas mask (basemap asli ketutup field+mask) */}
          {mode === "ombak" && (
            <Pane name="ombak-labels" style={{ zIndex: 270, pointerEvents: "none" }}>
              <TileLayer url={LABEL_TILES[theme]} subdomains={CARTO_SUBDOMAINS} maxZoom={20} />
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
          {mode === "cctv" && <CctvLayer onPick={pickCam} dead={deadCams} getPadding={getPadding} />}
          <MapController view={view} mode={mode} getPadding={getPadding} collapsed={collapsed} />
        </MapContainer>
      </div>

      <div className="scrim-top" />

      <Topbar
        sub={MODE_META[mode].sub}
        pill={pill}
        theme={theme}
        onToggleTheme={toggleTheme}
        onShare={onShare}
        canInstall={canInstall}
        onInstall={install}
        topbarRef={topbarRef}
        inert={modalOpen}
      />

      <Panel
        label={MODE_META[mode].panel}
        mode={mode}
        collapsed={collapsed}
        detail={detail}
        inert={modalOpen}
        panelRef={panelRef}
        onCollapse={setCollapsed}
        liveText={liveText}
        miniDot={
          mode === "ombak"
            ? "var(--text-dim)"
            : mode === "cctv"
              ? "var(--live-dot)"
              : rv.ok
                ? "var(--live-dot)"
                : "#f59e0b"
        }
        miniMain={
          mode === "cctv" ? (
            <>
              {MAPPED_CAMS.length}
              <span className="wib">KAMERA</span>
            </>
          ) : (
            <>
              {mode === "ombak" ? (ov.wib?.time ?? "—") : (current?.time ?? "—")}
              <span className="wib">WIB</span>
            </>
          )
        }
        miniSub={
          mode === "ombak"
            ? `Ombak · ${VIEWS[view].label}`
            : mode === "cctv"
              ? "CCTV · Kota Batam"
              : `${VIEWS[view].label}${radar.echo?.near ? " · ada echo" : ""}`
        }
      >
        {mode === "hujan" && (
          <StatusBlock
            value={current?.time ?? "—"}
            unit="WIB"
            date={rv.date}
            onRetry={radar.status === "error" && !offline ? radar.load : undefined}
            state={rv.state}
            warn={!rv.ok}
            dot={rv.ok ? "live" : "warn"}
          />
        )}
        {mode === "ombak" && (
          <StatusBlock
            value={ov.wib?.time ?? "—"}
            unit="WIB"
            date={ov.date}
            onRetry={ov.canRetry ? () => ofs.load(true) : undefined}
            state={ov.state}
            warn={ov.error || ov.stale}
            dot={ov.error ? "warn" : "dim"}
          />
        )}
        {mode === "cctv" && (
          <StatusBlock
            value={String(MAPPED_CAMS.length)}
            unit="KAMERA"
            date={`Pantauan langsung Kota Batam${deadCams.size > 0 ? ` · ${deadCams.size} lagi mati` : ""}`}
            state={activeCam ? "Langsung" : "Siaga"}
            warn={false}
            dot={activeCam ? "live" : "dim"}
          />
        )}

        {mode === "hujan" && (echoText || fcText) && (
          <div className="info-lines">
            {echoText && <InfoLine on={!!radar.echo?.near}>{echoText}</InfoLine>}
            {fcText && <InfoLine>{fcText}</InfoLine>}
          </div>
        )}
        {mode === "ombak" && pLine && ofs.perairan && (
          <div className="info-lines">
            <InfoLine warn={!!pLine.warning}>
              <b>{ofs.perairan.name}</b> · {pLine.text}
              {pLine.warning && <span className="info-warn"> · {pLine.warning}</span>}
            </InfoLine>
          </div>
        )}

        {mode === "cctv" && <CctvBlock recent={recentCams} dead={deadCams} onPick={pickCam} />}

        <ModeSwitch mode={mode} onChange={switchMode} />

        {mode !== "cctv" && (
          <Transport
            playing={playing}
            ready={mode === "hujan" ? rv.ready : ov.ready}
            onTogglePlay={togglePlay}
            label={mode === "ombak" ? "Waktu prakiraan gelombang" : "Penggeser waktu citra hujan"}
            valueText={mode === "ombak" ? ov.sliderText : rv.sliderText}
            max={mode === "ombak" ? Math.max(0, ov.count - 1) : Math.max(0, radar.frames.length - 1)}
            value={mode === "ombak" ? ofs.idx : radar.idx}
            onScrub={scrub}
            detail={detail}
            onToggleDetail={() => setDetail((d) => !d)}
          />
        )}

        <div id="panel-detail" className="panel-detail">
          {mode !== "cctv" && <ViewSelector keys={VIEW_KEYS[mode]} view={view} onChange={setView} />}
          {mode === "hujan" && <Conditions data={conditions.data} error={conditions.error} />}
          {mode === "hujan" && <RainMeta opacity={opacity} onOpacity={setOpacity} />}
          {mode === "ombak" && <OfsLegend />}
          <Credit />
        </div>
      </Panel>

      {activeCam && (
        <CctvPlayer
          key={activeCam.slug}
          cam={activeCam}
          onClose={closeCam}
          onDead={onDead}
          autoStart={camAutoStart}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <IosInstallHint />
    </div>
  );
}
