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
import { isSmallLandscape, isWide, saveData } from "@/lib/client";
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
  VIEW_KEYS,
  defaultViewFor,
  type Mode,
  type ViewKey,
} from "@/lib/radar";
import {
  cctvAnswer,
  forecastStrip,
  ofsAnswer,
  ofsCaption,
  ofsView,
  rainAnswer,
  rainyMap,
  rainCaption,
  radarView,
} from "@/lib/status";
import { useInstallPrompt, useNow, useOffline, useShare } from "@/hooks/useBrowser";
import { useOfs } from "@/hooks/useOfs";
import { useRevisit } from "@/hooks/usePolling";
import { useRadar } from "@/hooks/useRadar";
import { useResource } from "@/hooks/useResource";
import { useThemeMode } from "@/hooks/useThemeMode";
import CctvLayer, { type CamGroup, type CctvApi } from "./CctvLayer";
import CctvPlayer from "./CctvPlayer";
import KecamatanLayer from "./KecamatanLayer";
import IosInstallHint from "./IosInstallHint";
import MapController, { type Padding } from "./MapController";
import OfsField from "./OfsField";
import Panel from "./Panel";
import Topbar from "./Topbar";
import CamDirectory from "./panel/CamDirectory";
import CamList from "./panel/CamList";
import CctvBlock from "./panel/CctvBlock";
import Conditions from "./panel/Conditions";
import { Footer, Transport, ViewSelector } from "./panel/Controls";
import Credit from "./panel/Credit";
import { ForecastSection, KecTable, PerairanInfo } from "./panel/DetailSections";
import ForecastStrip from "./panel/ForecastStrip";
import { OfsCategories, OfsScale, RainOpacity, RainScale } from "./panel/Legends";
import SidebarHead from "./panel/SidebarHead";
import { Answer, WarnRow } from "./panel/Status";

// ---------------------------------------------------------------------------
// Orkestrator: merangkai hook data (hooks/*) dengan peta dan panel. Logika data ada di
// hook, aturan tampilan + salinan ada di lib/status.ts, potongan UI di components/panel/*.
// ---------------------------------------------------------------------------

// leaflet.vectorgrid (48 KB) cuma dibutuhkan mode OMBAK → jangan ikut chunk peta utama.
const LandMask = dynamic(() => import("./LandMask"), { ssr: false });

const TICK_MS = 30 * 1000; // label "X menit lalu" dihitung ulang
const CONDITIONS_MS = 2 * 60 * 1000;
const FORECAST_MS = 30 * 60 * 1000; // prakiraan BMKG 3-jaman; server menahan 15–30 menit
/** "Perbesar Peta ke Sini" dari daftar kelompok: cukup dekat untuk memisahkan pin. */
const GROUP_ZOOM = 16;

const MODE_META: Record<Mode, { sub: string; panel: string }> = {
  hujan: { sub: "Radar Hujan Batam dan Sekitarnya", panel: "Radar Hujan" },
  ombak: { sub: "Prakiraan Ombak BMKG", panel: "Prakiraan Ombak" },
  cctv: { sub: "Kamera Lalu Lintas Pemko Batam", panel: "Kamera Lalu Lintas" },
};

/** Param URL yang mewakili tampilan sekarang (?mode=&view=&cam=), hanya yang bukan default. */
function applyStateParams(p: URLSearchParams, mode: Mode, view: ViewKey, cam: Cam | null) {
  p.delete("mode");
  p.delete("view");
  p.delete("cam");
  if (mode !== "hujan") p.set("mode", mode);
  if (view !== defaultViewFor(mode)) p.set("view", view);
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
  // view peta terakhir di mode Hujan/Ombak — dipulihkan saat keluar dari CCTV
  const mapView = useRef<ViewKey>(init.mode === "cctv" ? DEFAULT_VIEW : init.view);

  // CCTV: kamera yang lagi diputar (null = nggak ada stream jalan), kamera yang gagal
  // diputar di sesi ini, 3 kamera terakhir dibuka, dan kelompok yang daftarnya terbuka.
  const [activeCam, setActiveCam] = useState<Cam | null>(init.cam);
  const [camAutoStart, setCamAutoStart] = useState(!init.cam); // dari link → tombol putar dulu
  const [deadCams, setDeadCams] = useState<Map<string, number | null>>(() => new Map());
  const [recentCams, setRecentCams] = useState<Cam[]>(init.recentCams);
  const [camGroup, setCamGroup] = useState<CamGroup | null>(null);
  const [camHint, setCamHint] = useState(init.camHint);
  const cctvApi = useRef<CctvApi | null>(null);

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

  // Padding fit dinamis: ukur panel & topbar asli biar wilayah selalu ke-frame penuh, nggak
  // ketutup. HP landscape: panel side-sheet kanan. Layar lebar: panel di kiri bawah, jadi
  // peta di-frame ke ruang kanannya.
  // ignoreDetail: framing VIEW (MapController) di mode CCTV mengabaikan lembar Daftar yang
  // terbuka supaya peta kamera tetap dibuka di z11; zoom ke kamera & panInside memakai
  // padding penuh (kamera jangan diterbangkan ke bawah lembar).
  const getPadding = useCallback((ignoreDetail = false): Padding => {
    const panel = panelRef.current;
    const panelH = panel?.offsetHeight ?? 220;
    const panelW = panel?.offsetWidth ?? 320;
    const topH = topbarRef.current?.offsetHeight ?? 64;
    if (isSmallLandscape()) return { paddingTopLeft: [14, topH + 8], paddingBottomRight: [panelW + 24, 14] };
    // layar lebar: sidebar kiri setinggi layar (tanpa bilah atas) → peta di-frame ke kanannya
    if (isWide()) return { paddingTopLeft: [panelW + 24, 24], paddingBottomRight: [24, 24] };
    // CCTV: lembar Daftar yang terbuka jangan ikut menyempitkan framing (peta kamera harus
    // tetap dibuka di z11 dengan kelompok ≤9).
    const det = panel?.querySelector<HTMLElement>("#panel-detail");
    const detH =
      ignoreDetail && det && panel?.dataset.detail === "true" && panel.dataset.mode === "cctv" ? det.offsetHeight + 12 : 0;
    return { paddingTopLeft: [14, topH + 8], paddingBottomRight: [14, Math.round(panelH - detH) + 24] };
  }, []);
  const getViewPadding = useCallback(() => getPadding(true), [getPadding]);
  const getFullPadding = useCallback(() => getPadding(false), [getPadding]);
  const focusPanel = useCallback(() => {
    panelRef.current?.querySelector<HTMLElement>(".answer")?.focus();
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

  // Keluar dari mode CCTV = matikan stream yang lagi jalan + tutup daftar kelompok.
  useEffect(() => {
    if (mode !== "cctv") {
      setActiveCam(null);
      setCamGroup(null);
    }
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
    setCamGroup(null);
    if (next === "cctv") {
      mapView.current = view;
      setView("kamera");
    } else {
      const base = mode === "cctv" ? mapView.current : view;
      // "Natuna" cuma ada di Ombak → ke Hujan jadi "Luas"; view lain yang tak sah → bawaan.
      setView(VIEW_KEYS[next].includes(base) ? base : base === "natuna" ? "regional" : DEFAULT_VIEW);
    }
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

  const toNow = () => {
    setPlaying(false);
    if (mode === "ombak") ofs.toNow();
    else radar.scrub(Math.max(0, radar.frames.length - 1));
  };

  const closeCam = useCallback(() => {
    setActiveCam(null);
    setCamAutoStart(true);
  }, []);

  const pickCam = useCallback((cam: Cam) => {
    setCamAutoStart(true);
    setActiveCam(cam);
    setCamHint(false);
    writePref(PREF.camHint, "1");
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

  const onCluster = useCallback((g: CamGroup | null) => {
    setCamGroup(g);
    if (g) {
      setDetail(false);
      setCollapsed(false);
    }
  }, []);

  // Tutup daftar kelompok: fokus kembali ke gelembungnya (tunggu panel merender ulang).
  const closeGroup = () => {
    const key = camGroup?.key;
    setCamGroup(null);
    if (key) window.setTimeout(() => cctvApi.current?.focusGroup(key), 30);
  };

  const zoomGroup = () => {
    const cams = camGroup?.cams ?? [];
    setCamGroup(null);
    // tunggu panel mengecil dulu supaya padding fit memakai tinggi panel yang baru; fokus
    // pindah ke jawaban panel (tombol daftar sudah hilang)
    window.setTimeout(() => {
      cctvApi.current?.zoomToCams(cams, GROUP_ZOOM);
      focusPanel();
    }, 30);
  };

  const toggleDetail = () => {
    if (!detail) setCamGroup(null);
    setDetail(!detail);
  };

  // ---- turunan tampilan ----
  const now = Math.max(tick, radar.loadedAt);
  const rv = radarView({
    frames: radar.frames,
    idx: radar.idx,
    status: radar.status,
    offline,
    now,
    broken: radar.broken,
  });
  const rain = rainAnswer({ echo: radar.echo, frames: radar.frames, rv, status: radar.status, offline, now });
  const rainCap = rainCaption(rv, now);
  const strip = forecastStrip(forecast.data, forecast.error, now);
  const tiles = forecastStrip(forecast.data, forecast.error, now, 4);
  const rainyKecs = rainyMap(radar.echo);
  const showKec = rv.isLatest && !rv.currentBroken && radar.status === "ok";
  // baris kecil di atas jawaban (hanya tampil di sidebar laptop)
  const rainEyebrow = rv.latest
    ? rv.fresh
      ? `Radar MSS · Terbaru ${rv.latest.time} WIB`
      : `Radar MSS · ${rv.latestWhen}`
    : "Radar MSS";
  const ov = ofsView({
    ofs: ofs.ofs,
    idx: ofs.idx,
    failed: ofs.failed,
    tilesDown: ofs.tilesDown,
    maskOk: ofs.maskOk,
    offline,
  });
  const ombak = ofsAnswer(ofs.perairan, ofs.perairanError, ov, offline);
  const ombakEyebrow = `Model Gelombang BMKG${ov.wib ? ` · Peta ${ov.wib.time} WIB` : ""}`;
  const ombakCap = ofsCaption(ov);
  const cctv = cctvAnswer(MAPPED_CAMS.length, deadCams.size);

  // Pembaca layar: hanya keadaan TERBARU (bukan tiap frame animasi/geseran).
  const liveText = mode === "hujan" ? rain.live : mode === "ombak" ? ombak.live : "";

  const onShare = () => {
    const q = applyStateParams(new URLSearchParams(), mode, view, activeCam).toString();
    const url = `${window.location.origin}${window.location.pathname}${q ? `?${q}` : ""}`;
    const text =
      mode === "hujan"
        ? rain.share
        : mode === "ombak"
          ? ombak.share
          : activeCam
            ? `CCTV ${activeCam.name}, Batam`
            : "Kamera Lalu Lintas Kota Batam";
    share({ title: "Hujan di Batam", text, url });
  };

  const modalOpen = !!activeCam;
  const current = rv.current;
  const firstTime = radar.frames[0]?.time;

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
          {/* Batas 12 kecamatan Kota Batam; yang sedang hujan disorot hanya saat peta
              menampilkan citra terbaru (hujan per kecamatan dihitung dari citra itu). */}
          {mode === "hujan" && (
            <KecamatanLayer rainy={rainyKecs} showRain={showKec} theme={theme} />
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
          {mode === "cctv" && (
            <CctvLayer
              onPick={pickCam}
              dead={deadCams}
              getPadding={getFullPadding}
              onCluster={onCluster}
              focusPanel={focusPanel}
              selectedKey={camGroup?.key ?? null}
              apiRef={cctvApi}
            />
          )}
          <MapController view={view} mode={mode} getPadding={getViewPadding} collapsed={collapsed} />
        </MapContainer>
      </div>

      <div className="scrim-top" />

      <Topbar
        sub={MODE_META[mode].sub}
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
        listing={mode === "cctv" && !!camGroup}
        inert={modalOpen}
        panelRef={panelRef}
        onCollapse={setCollapsed}
        liveText={liveText}
        miniMain={
          mode === "hujan" ? rain.mini : mode === "ombak" ? ombak.mini : `${MAPPED_CAMS.length} Kamera Lalu Lintas`
        }
        miniDot={mode === "hujan" ? rain.dot : null}
        head={
          <SidebarHead
            theme={theme}
            onToggleTheme={toggleTheme}
            onShare={onShare}
            canInstall={canInstall}
            onInstall={install}
          />
        }
      >
        {mode === "hujan" && (
          <>
            <Answer
              a={rain}
              eyebrow={rainEyebrow}
              live={rv.fresh}
              onRetry={rain.retry && !offline ? radar.load : undefined}
            />
            <RainScale />
            {forecast.data && <ForecastStrip place={forecast.data.place} strip={strip} />}
            <Transport
              playing={playing}
              ready={rv.ready}
              onTogglePlay={togglePlay}
              playLabel={firstTime ? `Putar Radar sejak ${firstTime} WIB` : "Putar Radar"}
              label="Waktu Peta Radar"
              valueText={rv.sliderText}
              max={Math.max(0, radar.frames.length - 1)}
              value={radar.idx}
              onScrub={scrub}
              caption={rainCap}
              onToNow={toNow}
            />
            <ViewSelector keys={VIEW_KEYS.hujan} view={view} onChange={setView} />
          </>
        )}

        {mode === "ombak" && (
          <>
            {ombak.warning && <WarnRow text={ombak.warning} chip />}
            <Answer
              a={ombak}
              eyebrow={ombakEyebrow}
              live={ov.ready && ov.phase === "now" && !ov.problem}
              onRetry={ombak.retry ? () => ofs.load(true) : undefined}
            />
            {ov.problem && <WarnRow text={ov.problem} />}
            <OfsScale />
            <Transport
              playing={playing}
              ready={ov.ready}
              onTogglePlay={togglePlay}
              playLabel={
                ov.lastWib ? `Putar Prakiraan Ombak sampai ${ov.lastWib.day} ${ov.lastWib.time}` : "Putar Prakiraan Ombak"
              }
              label="Waktu Prakiraan Ombak"
              valueText={ov.sliderText}
              max={Math.max(0, ov.count - 1)}
              value={ofs.idx}
              onScrub={scrub}
              caption={ombakCap}
              onToNow={toNow}
            />
            <ViewSelector keys={VIEW_KEYS.ombak} view={view} onChange={setView} />
          </>
        )}

        {mode === "cctv" &&
          (camGroup ? (
            <CamList
              key={camGroup.key}
              members={camGroup.cams}
              dead={deadCams}
              onPick={pickCam}
              onZoom={zoomGroup}
              onClose={closeGroup}
            />
          ) : (
            <>
              <Answer a={{ ...cctv, tone: "normal", dot: null }} />
              <CctvBlock recent={recentCams} dead={deadCams} onPick={pickCam} showHint={camHint} />
            </>
          ))}

        <Footer
          mode={mode}
          onMode={switchMode}
          detailLabel={mode === "cctv" ? "Daftar" : "Detail"}
          detail={detail}
          onToggleDetail={toggleDetail}
        />

        {/* Detail: di HP dilipat (tombol Detail/Daftar); di laptop selalu tampil di sidebar. */}
        {(
          <div id="panel-detail" className="panel-detail">
            {mode === "hujan" && (
              <>
                {radar.frames.length > 0 && <KecTable echo={radar.echo} when={rv.latestWhen} fresh={rv.fresh} />}
                <ForecastSection fc={forecast.data} tiles={tiles} note={strip.note} />
                <Conditions data={conditions.data} error={conditions.error} />
                <RainOpacity opacity={opacity} onOpacity={setOpacity} />
              </>
            )}
            {mode === "ombak" && (
              <>
                <PerairanInfo p={ofs.perairan} error={ofs.perairanError} />
                <OfsCategories />
              </>
            )}
            {mode === "cctv" && <CamDirectory dead={deadCams} onPick={pickCam} />}
            <Credit />
          </div>
        )}
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
