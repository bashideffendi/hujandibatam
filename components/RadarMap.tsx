"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
import type {
  ConditionsResponse,
  EchoSummary,
  FramesResponse,
  OfsResponse,
  PerairanResponse,
} from "@/lib/api-types";
import {
  CARTO_SUBDOMAINS,
  CCTV_MAX_ZOOM,
  DEFAULT_VIEW,
  LABEL_TILES,
  LEGEND,
  LEGEND_LABELS,
  MAX_ZOOM,
  MIN_ZOOM,
  OFS_CATEGORIES,
  OFS_MAX_M,
  OFS_SWH_COLORS,
  OMBAK_MIN_ZOOM,
  PLACES,
  RADAR_BOUNDS,
  RADAR_KM_PER_PX,
  TILES,
  VIEWS,
  VIEW_KEYS,
  ageMinutesOf,
  ofsValidWib,
  timeBasedTheme,
  type Frame,
  type Mode,
  type ThemeMode,
  type ViewKey,
} from "@/lib/radar";
import { CCTV_HOST, MAPPED_CAMS, UNMAPPED_CAMS, findCam, loadHls, type Cam } from "@/lib/cctv";
import IosInstallHint from "./IosInstallHint";
import CctvLayer from "./CctvLayer";
import CctvPlayer from "./CctvPlayer";
import OfsField from "./OfsField";

// leaflet.vectorgrid (48 KB) cuma dibutuhkan mode OMBAK → jangan ikut chunk peta utama.
const LandMask = dynamic(() => import("./LandMask"), { ssr: false });

const REFRESH_MS = 2 * 60 * 1000; // refetch frame & kondisi tiap 2 mnt (radar terbit tiap 5 mnt)
const PLAY_MS = 650;
const OFS_PLAY_MS = 1100; // animasi timeline gelombang lebih pelan dari radar
const TICK_MS = 30 * 1000; // jam "X mnt lalu" dihitung ulang
const FETCH_TIMEOUT_MS = 15000;
const LIVE_MAX_AGE_MIN = 18; // di atas ini citra dianggap tertunda (MSS terlambat/macet)
const OFS_STALE_H = 24; // run lebih tua dari 2 siklus (12 jam) = BMKG mandek
const THEME_KEY = "hujan-theme";
const MODE_KEY = "hujan-mode";
const VIEW_KEY = "hujan-view";
const COLLAPSED_KEY = "hujan-collapsed";
const RECENT_KEY = "hujan-cams-recent";
const PERAIRAN_MS = 30 * 60 * 1000; // prakiraan teks BMKG terbit 2x sehari

const reduceMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const saveData = () =>
  typeof navigator !== "undefined" &&
  !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
const isAbort = (e: unknown) => (e as Error)?.name === "AbortError";

// Legend gelombang: HARD STOP per band (peta contourf memakai satu warna per band, bukan gradien).
const OFS_GRADIENT = `linear-gradient(to right, ${OFS_SWH_COLORS.map((s, i) => {
  const from = ((s.m / OFS_MAX_M) * 100).toFixed(1);
  const to = (((OFS_SWH_COLORS[i + 1]?.m ?? OFS_MAX_M) / OFS_MAX_M) * 100).toFixed(1);
  return `${s.c} ${from}% ${to}%`;
}).join(", ")})`;
// Legend hujan: ramp warna asli PNG MSS.
const RAIN_GRADIENT = `linear-gradient(to right, ${LEGEND.join(", ")})`;
const fmtM = (n: number) => String(n).replace(".", ",");

const MODE_META: Record<Mode, { sub: string; panel: string }> = {
  hujan: { sub: "Radar hujan · Batam & sekitarnya", panel: "Kontrol radar hujan" },
  ombak: { sub: "Prakiraan ombak · Kepri", panel: "Kontrol prakiraan gelombang" },
  cctv: { sub: "CCTV lalu lintas · Kota Batam", panel: "Daftar kamera" },
};
const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

type Padding = { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] };

// Batas zoom per mode + fit peta ke bounding box view, dengan padding dinamis sesuai
// tinggi panel/topbar asli. Fit ulang saat rotasi layar — bukan tiap resize kecil.
function MapController({
  view,
  mode,
  getPadding,
  collapsed,
}: {
  view: ViewKey;
  mode: Mode;
  getPadding: () => Padding;
  collapsed: boolean;
}) {
  const map = useMap();
  const mounted = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const fit = useCallback(
    (animate: boolean, duration = 0.8) => {
      const b = VIEWS[viewRef.current].bounds;
      const opts = getPadding();
      if (!animate || reduceMotion()) map.fitBounds(b, { ...opts, animate: false });
      else map.flyToBounds(b, { ...opts, duration });
    },
    [map, getPadding],
  );

  // SATU effect untuk [mode, view]: batas zoom ditulis langsung ke options (setMinZoom/
  // setMaxZoom Leaflet memicu setZoom BERANIMASI yang berebut sama flyToBounds), lalu fit.
  //  - OMBAK: zoom-out lebih jauh (gak ada radar yg pecah) biar laut jauh keliatan;
  //  - CCTV: zoom-in lebih dalam biar pin berdempet bisa dipisah & diklik;
  //  - ganti mode TANPA ganti view tetap reframe (tinggi panel beda per mode).
  useEffect(() => {
    const min = mode === "ombak" ? OMBAK_MIN_ZOOM : MIN_ZOOM;
    const max = mode === "cctv" ? CCTV_MAX_ZOOM : MAX_ZOOM;
    map.options.minZoom = min;
    map.options.maxZoom = max;
    map.fire("zoomlevelschange");
    if (!mounted.current) {
      mounted.current = true;
      map.invalidateSize();
      fit(false);
      return;
    }
    const z = map.getZoom();
    if (z < min || z > max) map.setZoom(Math.min(max, Math.max(min, z)), { animate: false });
    fit(true);
  }, [mode, view, map, fit]);

  // panel ditutup/dibuka -> tinggi panel berubah -> re-frame halus pakai ruang baru
  const firstCollapse = useRef(true);
  useEffect(() => {
    if (firstCollapse.current) {
      firstCollapse.current = false;
      return;
    }
    fit(true, 0.4);
  }, [collapsed, fit]);

  // resize: invalidateSize selalu (debounce), tapi fit ulang HANYA kalau lebar berubah
  // banyak (rotasi/split-screen) — toolbar browser muncul/hilang atau keluar fullscreen
  // video CCTV jangan sampai membuang pan/zoom pengguna.
  useEffect(() => {
    let lastW = window.innerWidth;
    let t: number | null = null;
    const onResize = () => {
      if (t !== null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        map.invalidateSize();
        const w = window.innerWidth;
        if (Math.abs(w - lastW) > 80) {
          lastW = w;
          fit(false);
        }
      }, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (t !== null) window.clearTimeout(t);
    };
  }, [map, fit]);

  return null;
}

const IconSun = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const IconMoon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);
const DROP_PATH = "M12 2.5c3.6 4.3 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.4-6.5 6-10.8Z";
const CAM_PATH_A = "M3 8.5A2.5 2.5 0 0 1 5.5 6h6A2.5 2.5 0 0 1 14 8.5v7A2.5 2.5 0 0 1 11.5 18h-6A2.5 2.5 0 0 1 3 15.5Z";
const CAM_PATH_B = "M14 10.5 21 7v10l-7-3.5Z";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

// State awal: URL (?mode=&view=&cam=) menang atas localStorage; semuanya divalidasi ketat.
function readInitial() {
  let urlMode: Mode | null = null;
  let urlView: ViewKey | null = null;
  let cam: Cam | null = null;
  try {
    const p = new URLSearchParams(window.location.search);
    const m = p.get("mode");
    if (m === "hujan" || m === "ombak" || m === "cctv") urlMode = m;
    const v = p.get("view");
    if (v && v in VIEWS) urlView = v as ViewKey;
    cam = findCam(p.get("cam"));
  } catch {
    /* abaikan */
  }
  const ls = (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  let mode: Mode = "hujan";
  if (cam) mode = "cctv";
  else if (urlMode) mode = urlMode;
  else {
    const s = ls(MODE_KEY);
    if (s === "ombak" || s === "cctv") mode = s;
  }
  let view: ViewKey = mode === "cctv" ? "batam" : DEFAULT_VIEW;
  const sv = ls(VIEW_KEY);
  if (urlView && VIEW_KEYS[mode].includes(urlView)) view = urlView;
  else if (sv && sv in VIEWS && VIEW_KEYS[mode].includes(sv as ViewKey)) view = sv as ViewKey;
  const st = ls(THEME_KEY);
  const themeOverride: ThemeMode | null = st === "light" || st === "dark" ? st : null;
  return {
    mode,
    view,
    cam,
    collapsed: ls(COLLAPSED_KEY) === "1",
    themeOverride,
    theme: themeOverride ?? timeBasedTheme(),
  };
}

export default function RadarMap() {
  // Komponen ini client-only (dynamic ssr:false) jadi aman baca window/localStorage di initializer.
  const init = useMemo(readInitial, []);

  const [frames, setFrames] = useState<Frame[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [view, setView] = useState<ViewKey>(init.view);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [stale, setStale] = useState(false);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(() => new Set());
  const [conditions, setConditions] = useState<ConditionsResponse | null>(null);
  const [conditionsError, setConditionsError] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(init.collapsed);
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<Mode>(init.mode);
  const [theme, setTheme] = useState<ThemeMode>(init.theme);

  // OMBAK: state ombak (idx) terpisah dari radar biar balik mode posisi masing-masing tetap.
  const [ofs, setOfs] = useState<OfsResponse | null>(null);
  const [ofsIdx, setOfsIdx] = useState(0);
  const [ofsFailed, setOfsFailed] = useState(false);
  const [ofsTilesDown, setOfsTilesDown] = useState(false);
  const [maskOk, setMaskOk] = useState<boolean | null>(null);
  const [perairan, setPerairan] = useState<PerairanResponse | null>(null);
  const [echo, setEcho] = useState<EchoSummary | null>(null);
  // CCTV: 3 kamera terakhir dibuka (localStorage, divalidasi ke daftar kamera).
  const [recentCams, setRecentCams] = useState<Cam[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      return (Array.isArray(raw) ? raw : [])
        .map((s) => findCam(String(s)))
        .filter((c): c is Cam => !!c)
        .slice(0, 3);
    } catch {
      return [];
    }
  });

  // CCTV: kamera yang lagi diputar (null = nggak ada stream jalan) + kamera yang terbukti mati sesi ini.
  const [activeCam, setActiveCam] = useState<Cam | null>(init.cam);
  const [camAutoStart, setCamAutoStart] = useState(!init.cam); // dari link → tombol putar dulu, jangan auto-narik
  const [deadCams, setDeadCams] = useState<Map<string, number | null>>(() => new Map());

  const followRef = useRef(true);
  const themeOverride = useRef<ThemeMode | null>(init.themeOverride);
  const panelRef = useRef<HTMLElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const miniRef = useRef<HTMLButtonElement>(null);
  const preloadedRef = useRef<Set<string>>(new Set());
  const ofsManualRef = useRef(false); // user scrub manual → jangan auto-realign tiap refetch
  const playingRef = useRef(false);
  const framesRef = useRef<Frame[]>([]);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const brokenRef = useRef(brokenUrls);
  brokenRef.current = brokenUrls;
  const ofsRef = useRef<OfsResponse | null>(null);
  const activeCamRef = useRef<Cam | null>(null);
  activeCamRef.current = activeCam;
  const framesCtrl = useRef<AbortController | null>(null);
  const condCtrl = useRef<AbortController | null>(null);
  const ofsCtrl = useRef<AbortController | null>(null);
  const perairanCtrl = useRef<AbortController | null>(null);
  const collapseTouched = useRef(false);

  // Padding fit dinamis: ukur tinggi panel & topbar asli (di HP panel bisa lebih tinggi karena
  // konten wrap; wordmark bisa 2 baris) biar wilayah selalu ke-frame penuh, nggak ketutup.
  // Landscape HP: panel jadi side-sheet kanan → padding-nya di kanan.
  const getPadding = useCallback((): Padding => {
    const panelH = panelRef.current?.offsetHeight ?? 220;
    const topH = topbarRef.current?.offsetHeight ?? 64;
    const side = !!window.matchMedia?.("(max-height: 480px) and (orientation: landscape)").matches;
    if (side) {
      const w = panelRef.current?.offsetWidth ?? 320;
      return { paddingTopLeft: [14, topH + 8], paddingBottomRight: [w + 24, 14] };
    }
    return { paddingTopLeft: [14, topH + 8], paddingBottomRight: [14, Math.round(panelH) + 24] };
  }, []);

  // fetch JSON: batalkan panggilan sebelumnya (respons lama nggak boleh menimpa yang baru),
  // timeout 15 dtk (bukan menggantung selama maxDuration server).
  const fetchJson = useCallback(
    async <T,>(url: string, ctrlRef: RefObject<AbortController | null>): Promise<T> => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const timer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        if (!res.ok) throw new Error(`http ${res.status}`);
        return (await res.json()) as T;
      } finally {
        window.clearTimeout(timer);
        if (ctrlRef.current === ctrl) ctrlRef.current = null;
      }
    },
    [],
  );

  const loadFrames = useCallback(async () => {
    try {
      const data = await fetchJson<FramesResponse>("/api/frames", framesCtrl);
      if (data.frames?.length) {
        const prevTs = framesRef.current[idxRef.current]?.ts;
        framesRef.current = data.frames;
        setFrames(data.frames);
        setStale(Boolean(data.stale));
        setEcho(data.echo ?? null);
        // Realign berdasarkan TIMESTAMP, bukan indeks: daftar bergeser 1 langkah tiap refetch,
        // jadi hasil scrub nggak diam-diam maju 5 menit. Saat Putar, biarkan loop jalan.
        if (!playingRef.current) {
          setIdx((prev) => {
            if (followRef.current) return data.frames.length - 1;
            const j = prevTs ? data.frames.findIndex((f) => f.ts === prevTs) : -1;
            return j >= 0 ? j : Math.min(prev, data.frames.length - 1);
          });
        }
        setStatus("ok");
      } else {
        // MSS nihil: pertahankan frames lama (kalau ada) tapi tandai tertunda.
        setStale(true);
        setStatus((s) => (framesRef.current.length ? s : "error"));
      }
      setNow(Date.now());
    } catch (e) {
      if (isAbort(e)) return;
      setStatus("error");
    }
  }, [fetchJson]);

  const loadConditions = useCallback(async () => {
    try {
      setConditions(await fetchJson<ConditionsResponse>("/api/conditions", condCtrl));
      setConditionsError(false);
    } catch (e) {
      if (isAbort(e)) return;
      setConditionsError(true);
    }
  }, [fetchJson]);

  const loadOfs = useCallback(
    async (resetIdx: boolean) => {
      try {
        const d = await fetchJson<OfsResponse>("/api/ofs-frame", ofsCtrl);
        ofsRef.current = d;
        setOfs(d);
        setOfsFailed(false);
        // Buka di frame yg nutupin jam-sekarang, KECUALI user lagi scrub manual (biar
        // reopen PWA sesudah lewat waktu nggak nyangkut di frame lama).
        if ((resetIdx || !ofsManualRef.current) && d.frames?.length) {
          setOfsIdx(Math.max(0, Math.min(d.frames.length - 1, d.nowIndex)));
        }
      } catch (e) {
        if (isAbort(e)) return;
        setOfsFailed(true); // → panel bisa bilang "gangguan" + tombol coba lagi (bukan "Memuat…" selamanya)
      }
    },
    [fetchJson],
  );

  // Prakiraan teks BMKG "Perairan Kep. Batam" (E.02) — data yang PERSIS Batam, mode OMBAK.
  const loadPerairan = useCallback(async () => {
    try {
      setPerairan(await fetchJson<PerairanResponse>("/api/perairan", perairanCtrl));
    } catch (e) {
      if (isAbort(e)) return;
      setPerairan(null); // gagal → barisnya disembunyikan, jangan mengarang
    }
  }, [fetchJson]);
  useEffect(() => {
    if (mode !== "ombak") return;
    loadPerairan();
    const t = setInterval(() => {
      if (!document.hidden) loadPerairan();
    }, PERAIRAN_MS);
    return () => clearInterval(t);
  }, [mode, loadPerairan]);

  // Polling DIGERBANG per mode & visibilitas: HUJAN poll frame+kondisi, OMBAK poll OFS,
  // CCTV nggak poll apa-apa. Masuk mode → fetch segera (data lama nggak dipakai 2 menit).
  useEffect(() => {
    if (mode !== "hujan") return;
    loadFrames();
    loadConditions();
    const t = setInterval(() => {
      if (document.hidden) return;
      loadFrames();
      loadConditions();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [mode, loadFrames, loadConditions]);

  useEffect(() => {
    if (mode !== "ombak") return;
    loadOfs(!ofsRef.current);
    const t = setInterval(() => {
      if (!document.hidden) loadOfs(false);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [mode, loadOfs]);

  // Tema auto ikut jam WIB, di timer sendiri — ditunda saat animasi jalan atau kamera terbuka
  // (flip tema membongkar basemap + mask + label sekaligus).
  useEffect(() => {
    const t = setInterval(() => {
      if (themeOverride.current || playingRef.current || activeCamRef.current) return;
      const next = timeBasedTheme();
      setTheme((cur) => (cur === next ? cur : next));
    }, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Tema → <html data-theme> (body/placeholder ikut) + <meta theme-color> (bar status/browser).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const color = theme === "dark" ? "#0c0d10" : "#e8eaed";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [theme]);

  // Persistensi preferensi.
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(VIEW_KEY, view);
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* abaikan */
    }
  }, [mode, view, collapsed]);

  // URL mencerminkan state (bisa dibagikan): ?mode=&view=&cam= — param lain (mis. debug) dipertahankan.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      p.delete("mode");
      p.delete("view");
      p.delete("cam");
      if (mode !== "hujan") p.set("mode", mode);
      if (view !== (mode === "cctv" ? "batam" : DEFAULT_VIEW)) p.set("view", view);
      if (activeCam) p.set("cam", activeCam.slug);
      const q = p.toString();
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

  // App balik kelihatan (reopen PWA / balik ke tab / restore bfcache) atau sinyal balik → fetch ulang.
  useEffect(() => {
    const refetch = (reopen: boolean) => {
      if (document.visibilityState !== "visible") return;
      if (mode === "hujan") {
        loadFrames();
        loadConditions();
      } else if (mode === "ombak") {
        if (reopen) ofsManualRef.current = false; // reopen → realign ke "sekarang"
        loadOfs(reopen);
      }
    };
    const onVis = () => refetch(false); // tab switch biasa: hormati scrub manual
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refetch(true); // restore bfcache = reopen: balik ke "sekarang"
    };
    const onOnline = () => {
      setOffline(false);
      refetch(false);
    };
    const onOffline = () => setOffline(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [mode, loadFrames, loadConditions, loadOfs]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const markBroken = useCallback((url: string) => {
    setBrokenUrls((prev) => {
      if (prev.has(url)) return prev;
      const n = new Set(prev);
      n.add(url);
      return n;
    });
  }, []);

  // Preload PNG radar: cuma mode HUJAN, hormati Data Saver, terbaru dulu (6 langsung, sisanya
  // saat idle), prioritas rendah. Frame 404 ditandai broken (jangan tampil sbg "tidak hujan").
  useEffect(() => {
    if (mode !== "hujan" || saveData()) return;
    const list = [...frames].reverse();
    const warm = (f: Frame) => {
      if (preloadedRef.current.has(f.url)) return;
      preloadedRef.current.add(f.url);
      const img = new window.Image();
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
      img.decoding = "async";
      img.onerror = () => {
        preloadedRef.current.delete(f.url);
        markBroken(f.url);
      };
      img.src = f.url;
    };
    list.slice(0, 6).forEach(warm);
    const rest = list.slice(6);
    // requestIdleCallback belum ada di Safari lama → fallback timeout.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const handle = hasIdle
      ? window.requestIdleCallback(() => rest.forEach(warm))
      : window.setTimeout(() => rest.forEach(warm), 1500);
    return () => {
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [frames, mode, markBroken]);

  const ofsCount = ofs?.frames.length ?? 0;
  useEffect(() => {
    playingRef.current = playing;
    if (!playing) return;
    if (mode === "hujan") {
      if (frames.length < 2) return;
      const t = setInterval(
        () =>
          setIdx((i) => {
            const n = frames.length;
            let j = (i + 1) % n;
            let guard = 0;
            while (brokenRef.current.has(frames[j]?.url) && guard++ < n) j = (j + 1) % n; // lompati frame bolong
            return j;
          }),
        PLAY_MS,
      );
      return () => clearInterval(t);
    }
    // OMBAK: sweep timeline forecast SEKALI lalu berhenti (tile reload tiap step, jangan loop).
    if (mode !== "ombak" || ofsCount < 2) return;
    ofsManualRef.current = true; // sweep = posisi manual: refetch jangan narik balik ke nowIndex
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
  }, [playing, mode, frames, ofsCount]);

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

  // Collapse: tombol handle & mini saling unmount → pindahkan fokus ke penggantinya.
  useEffect(() => {
    if (!collapseTouched.current) return;
    (collapsed ? miniRef.current : handleRef.current)?.focus();
  }, [collapsed]);
  const toggleCollapsed = (v: boolean) => {
    collapseTouched.current = true;
    setCollapsed(v);
  };

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
    if (next !== "ombak") ofsManualRef.current = false; // keluar ombak → boleh auto-realign frame lagi
    // view "Natuna" cuma valid di mode ombak; semua kamera ada di Pulau Batam.
    if (next === "cctv") setView("batam");
    else if (!VIEW_KEYS[next].includes(view)) setView("regional");
    setMode(next);
  }

  const closeCam = useCallback(() => {
    setActiveCam(null);
    setCamAutoStart(true);
  }, []);
  const pickCam = useCallback((cam: Cam) => {
    setCamAutoStart(true);
    setActiveCam(cam);
    setRecentCams((prev) => {
      const next = [cam, ...prev.filter((c) => c.slug !== cam.slug)].slice(0, 3);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next.map((c) => c.slug)));
      } catch {
        /* abaikan */
      }
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
  const onMaskStatus = useCallback((ok: boolean) => setMaskOk(ok), []);
  const onOfsTiles = useCallback((down: boolean) => setOfsTilesDown(down), []);

  // ---- turunan HUJAN ----
  const current = frames[idx];
  const isLatest = frames.length > 0 && idx === frames.length - 1;
  const ready = frames.length >= 2;
  const viewKeys = VIEW_KEYS[mode];
  const currentAge = current ? ageMinutesOf(current.ts, now) : null;
  const latestAge = frames.length ? ageMinutesOf(frames[frames.length - 1].ts, now) : null;
  // "Langsung" dihitung di klien dari umur citra — frame beku tetap ketahuan walau API tak terjangkau.
  const radarLive = status === "ok" && !stale && latestAge !== null && latestAge <= LIVE_MAX_AGE_MIN;
  const currentBroken = !!current && brokenUrls.has(current.url);
  const radarPill: { text: string; stale: boolean } = !frames.length
    ? status === "error"
      ? { text: offline ? "Offline" : "Terputus", stale: true }
      : { text: "Memuat", stale: false }
    : status === "error"
      ? { text: offline ? "Offline" : "Terputus", stale: true }
      : !radarLive
        ? { text: "Tertunda", stale: true }
        : { text: "Langsung", stale: false };
  const radarState = !frames.length
    ? status === "error"
      ? "Gagal memuat"
      : "Memuat"
    : !isLatest
      ? `Riwayat · −${Math.max(0, (currentAge ?? 0) - (latestAge ?? 0))} mnt`
      : status === "error"
        ? "Terputus"
        : !radarLive
          ? "Data tertunda"
          : "Citra terakhir";
  const radarOk = frames.length > 0 && isLatest && radarLive;
  const radarDate =
    offline && status === "error"
      ? "Lagi offline — nunggu sinyal"
      : status === "error" && !frames.length
        ? "Gagal memuat radar"
        : !current
          ? "Memuat data…"
          : currentBroken
            ? `Citra ${current.time} tidak tersedia dari MSS`
            : isLatest
              ? `${current.date} · citra ${latestAge ?? 0} mnt lalu`
              : current.date;

  // Echo radar di kotak Batam ±20 km — jawaban langsung "lagi ada hujan nggak?". Tetap
  // disebut "echo" (bukan "hujan"): radar melihat butiran di udara, belum tentu sampai tanah.
  const echoLast = echo?.lastTs ? frames.find((f) => f.ts === echo.lastTs) : undefined;
  const echoLastAge = echo?.lastTs ? ageMinutesOf(echo.lastTs, now) : null;
  const echoText =
    !echo || status === "error" || !frames.length
      ? null
      : echo.near
        ? `Radar ±20 km Batam: ADA echo${echo.level ? ` · ${echo.level}` : ""}${
            echo.coverage >= 0.005 ? ` · ${Math.round(echo.coverage * 100)}% area` : ""
          }`
        : echo.lastTs
          ? `Radar ±20 km Batam: nihil · terakhir ${echoLast?.time ?? "—"}${
              echoLastAge !== null ? ` (${echoLastAge} mnt lalu)` : ""
            }`
          : `Radar ±20 km Batam: nihil ${echo.lookbackMin} mnt terakhir`;

  // ---- turunan OMBAK ----
  const perairanCur = perairan?.current ?? null;
  const fmtWave = (s: string) => s.replace(/\./g, ",").replace(/\s*-\s*/, "–");
  const ofsReady = ofsCount > 0;
  const ofsError = ofsFailed || ofsTilesDown || (!!ofs && !ofsReady);
  const ofsValid = ofs?.frames[ofsIdx];
  const ofsWib = ofsValid ? ofsValidWib(ofsValid) : null;
  const nowIndex = ofs?.nowIndex ?? 0;
  const ofsIsNow = ofsReady && ofsIdx === nowIndex;
  const ofsPast = ofsReady && ofsIdx < nowIndex;
  // Kesegaran dari UMUR run (bukan flag fallback): probe yang nemu run 4 jam lalu itu segar;
  // run dari modelrun yang mandek 30 jam itu basi. Slot buta = tebakan → selalu ditandai.
  const ofsStale = ofsReady && ((ofs?.ageH ?? 0) > OFS_STALE_H || ofs?.source === "blind");
  const ofsExpired = !!ofs?.expired;
  const ofsDate =
    ofsFailed && !ofsReady
      ? offline
        ? "Lagi offline — nunggu sinyal"
        : "Data gelombang BMKG lagi gangguan"
      : ofsTilesDown
        ? "Tile gelombang BMKG gagal dimuat di perangkat ini"
        : ofsExpired
          ? "Data gelombang BMKG belum diperbarui"
          : ofsReady
            ? `Gelombang BMKG${ofsWib ? ` · ${ofsWib.date}` : ""}${ofsStale ? ` · run ${ofs?.ageH} jam lalu` : ""}${
                maskOk === false ? " · mask darat gagal, warna di atas pulau bukan data" : ""
              }`
            : "Memuat prakiraan…";
  const ofsState = ofsError
    ? "Gangguan"
    : ofsExpired
      ? "Kedaluwarsa"
      : ofsPast
        ? "Sudah lewat"
        : ofsIsNow
          ? "Sekarang"
          : "Prakiraan";
  const ofsOpacity = maskOk === false ? 0.45 : 1; // mask gagal → darat tembus, jangan ketutup warna

  const liveText =
    mode === "hujan" ? `${radarPill.text}. ${radarDate}` : mode === "ombak" ? `${ofsState}. ${ofsDate}` : "";
  const sliderValueText =
    mode === "ombak"
      ? ofsWib
        ? `${ofsWib.time} WIB, ${ofsWib.date}`
        : ""
      : current
        ? `${current.time} WIB, ${current.date}`
        : "";

  const modalOpen = !!activeCam;

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
          {mode === "hujan" && current && !currentBroken && (
            <ImageOverlay
              url={current.url}
              bounds={RADAR_BOUNDS}
              opacity={opacity}
              zIndex={300}
              attribution="Radar: Meteorological Service Singapore"
              eventHandlers={{ error: () => markBroken(current.url) }}
            />
          )}
          {/* Field gelombang OFS (double-buffer, nggak berkedip) di atas basemap */}
          {mode === "ombak" && ofs?.baserun && ofsValid && (
            <OfsField baserun={ofs.baserun} valid={ofsValid} opacity={ofsOpacity} onTilesDown={onOfsTiles} />
          )}
          {/* Mask daratan (fill = warna land basemap) di atas field → darat nol-tint, laut field */}
          {mode === "ombak" && <LandMask theme={theme} onStatus={onMaskStatus} />}
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
          {mode === "cctv" && <CctvLayer onPick={pickCam} dead={deadCams} />}
          <MapController view={view} mode={mode} getPadding={getPadding} collapsed={collapsed} />
        </MapContainer>
      </div>

      <div className="scrim-top" />

      <header className="topbar" ref={topbarRef} inert={modalOpen}>
        <div className="brand">
          <span className="mark">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={DROP_PATH} />
            </svg>
          </span>
          <div>
            <h1 className="name">
              Hujan <i>di</i> Batam
            </h1>
            <div className="sub">{MODE_META[mode].sub}</div>
          </div>
        </div>
        <div className="topbar-right">
          {installEvt && (
            <button className="install-btn" onClick={doInstall} aria-label="Pasang aplikasi ke layar utama">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12M7 11l5 4 5-4M5 21h14" />
              </svg>
              Pasang
            </button>
          )}
          {mode === "ombak" ? (
            <span className="live-pill forecast">
              <span className="dot" /> Prakiraan
            </span>
          ) : mode === "cctv" ? (
            <span className={`live-pill${activeCam ? "" : " forecast"}`}>
              <span className="dot" /> {activeCam ? "Langsung" : "Siaga"}
            </span>
          ) : (
            <span className="live-pill" data-stale={radarPill.stale ? "" : undefined}>
              <span className="dot" /> {radarPill.text}
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
        aria-label={MODE_META[mode].panel}
        ref={panelRef}
        data-collapsed={collapsed}
        inert={modalOpen}
      >
        {!collapsed && (
          <button
            ref={handleRef}
            className="panel-handle"
            onClick={() => toggleCollapsed(true)}
            aria-label="Sembunyikan panel"
            aria-expanded={true}
            aria-controls="panel-body"
          >
            <svg className="handle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}

        {collapsed ? (
          <button
            ref={miniRef}
            className="panel-mini"
            onClick={() => toggleCollapsed(false)}
            aria-label="Buka panel"
            aria-expanded={false}
            aria-controls="panel-body"
          >
            <span
              className="mini-dot"
              style={{
                background:
                  mode === "ombak" ? "var(--text-dim)" : mode === "cctv" ? "var(--live-dot)" : radarOk ? "var(--live-dot)" : "#f59e0b",
              }}
            />
            <span className="mini-time">
              {mode === "ombak" ? (
                <>
                  {ofsWib ? ofsWib.time : "—"}
                  <span className="wib">WIB</span>
                </>
              ) : mode === "cctv" ? (
                <>
                  {MAPPED_CAMS.length}
                  <span className="wib">KAMERA</span>
                </>
              ) : (
                <>
                  {current ? current.time : "—"}
                  <span className="wib">WIB</span>
                </>
              )}
            </span>
            <span className="mini-view">
              {mode === "ombak" ? `Ombak · ${VIEWS[view].label}` : mode === "cctv" ? "CCTV · Kota Batam" : `${VIEWS[view].label}${echo?.near ? " · ada echo" : ""}`}
            </span>
            <svg className="mini-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        ) : (
          <div id="panel-body">
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
                        {ofsDate}
                        {ofsFailed && !ofsReady && !offline && (
                          <>
                            {" "}
                            <button className="link-btn" onClick={() => loadOfs(true)}>
                              Coba lagi
                            </button>
                          </>
                        )}
                      </div>
                      {perairan && perairanCur && (
                        <div className={`perairan-line${perairanCur.warning ? " has-warn" : ""}`}>
                          <span className="d" />
                          <span>
                            <b>{perairan.name}</b> · BMKG: {perairanCur.waveCat.toLowerCase()}{" "}
                            {fmtWave(perairanCur.waveDesc)}
                            {perairanCur.windMinKt !== null && perairanCur.windMaxKt !== null
                              ? ` · angin ${perairanCur.windMinKt}–${perairanCur.windMaxKt} kt dari ${perairanCur.windFrom.toLowerCase()}`
                              : ""}
                            {perairan.upcoming ? " (periode berikutnya)" : ""}
                            {perairanCur.warning && (
                              <span className="perairan-warn"> · {perairanCur.warning}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className={`state${ofsError || ofsStale ? " is-stale" : ""}`}>
                      <span className="d" style={{ background: ofsError ? "#f59e0b" : "var(--text-dim)" }} />
                      {ofsState}
                    </div>
                  </>
                ) : mode === "cctv" ? (
                  <>
                    <div>
                      <div className="time">
                        {MAPPED_CAMS.length}
                        <span className="wib">KAMERA</span>
                      </div>
                      <div className="date">
                        Pantauan langsung Kota Batam
                        {deadCams.size > 0 && ` · ${deadCams.size} lagi mati`}
                      </div>
                    </div>
                    <div className="state">
                      <span className="d" style={{ background: activeCam ? "var(--live-dot)" : "var(--text-dim)" }} />
                      {activeCam ? "Langsung" : "Siaga"}
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
                        {radarDate}
                        {status === "error" && !offline && (
                          <>
                            {" "}
                            <button className="link-btn" onClick={() => loadFrames()}>
                              Coba lagi
                            </button>
                          </>
                        )}
                      </div>
                      {echoText && (
                        <div className={`echo-line${echo?.near ? " is-on" : ""}`}>
                          <span className="d" />
                          {echoText}
                        </div>
                      )}
                    </div>
                    <div className={`state${radarOk ? "" : " is-stale"}`}>
                      <span className="d" style={{ background: radarOk ? "var(--live-dot)" : "#f59e0b" }} />
                      {radarState}
                    </div>
                  </>
                )}
              </div>

              {mode === "hujan" &&
                conditions &&
                (conditions.aq || conditions.wind || conditions.rain || conditions.uv || conditions.nowcast) && (
                  <div className="conditions-wrap">
                    <div className="conditions">
                      {conditions.nowcast && (
                        <span
                          className={`chip${conditions.nowcast.rain ? " is-rain" : ""}`}
                          title={`Prakiraan 2 jam NEA area ${conditions.nowcast.area}: ${conditions.nowcast.raw}`}
                        >
                          <svg className="rain-ico" viewBox="0 0 24 24" aria-hidden>
                            <path d={DROP_PATH} />
                          </svg>
                          2 jam <b>{conditions.nowcast.text}</b>
                          <span className="chip-sub">SG · {conditions.nowcast.area}</span>
                        </span>
                      )}
                      {conditions.rain && (
                        <span
                          className="chip is-rain"
                          title={`Curah hujan 5 menit ${nf1.format(conditions.rain.mm)} mm di ${conditions.rain.station} — stasiun Singapura terdekat`}
                        >
                          <svg className="rain-ico" viewBox="0 0 24 24" aria-hidden>
                            <path d={DROP_PATH} />
                          </svg>
                          Hujan <b>{nf1.format(conditions.rain.mm)} mm</b>
                          <span className="chip-sub">SG · {conditions.rain.station}</span>
                        </span>
                      )}
                      {conditions.aq && (
                        <span
                          className="chip"
                          title={`PSI 24 jam ${conditions.aq.psi}${
                            conditions.aq.pm25 != null ? ` · PM2.5 24 jam ${conditions.aq.pm25} µg/m³` : ""
                          } — region Singapura selatan`}
                        >
                          <span className="chip-dot" style={{ background: conditions.aq.color }} />
                          Udara <b>{conditions.aq.psi}</b>
                          <span className="chip-sub">{conditions.aq.label}</span>
                        </span>
                      )}
                      {conditions.uv && (
                        <span className="chip" title={`Indeks UV jam ini ${conditions.uv.value} (Singapura, lintang sama)`}>
                          <svg className="uv-ico" viewBox="0 0 24 24" fill="none" stroke={conditions.uv.color} strokeWidth={1.7} strokeLinecap="round" aria-hidden>
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
                          title={`Angin ${conditions.wind.knots} knot dari ${conditions.wind.label}${
                            conditions.wind.station ? ` · ${conditions.wind.station}` : ""
                          }`}
                        >
                          <svg
                            className="wind-arrow"
                            viewBox="0 0 24 24"
                            style={{ transform: `rotate(${conditions.wind.deg + 180}deg)` }}
                            aria-hidden
                          >
                            <path d="M12 3l5 8h-3v8h-4v-8H7z" />
                          </svg>
                          Angin <b>{conditions.wind.speed} km/j</b>
                          <span className="chip-sub">dari {conditions.wind.label}</span>
                        </span>
                      )}
                    </div>
                    <div className="conditions-note">Stasiun NEA Singapura terdekat · proksi buat Batam</div>
                  </div>
                )}

              {mode === "hujan" && conditionsError && !conditions && (
                <div className="conditions-err">Data cuaca tambahan lagi nggak tersedia</div>
              )}

              {mode === "cctv" && recentCams.length > 0 && (
                <div className="cam-extra cam-recent">
                  <span className="cam-extra-lab">Terakhir dibuka</span>
                  {recentCams.map((c) => (
                    <button
                      key={c.slug}
                      className={`cam-chip${deadCams.has(c.slug) ? " is-mati" : ""}`}
                      onClick={() => pickCam(c)}
                    >
                      {c.name}
                      {deadCams.has(c.slug) ? " · mati" : ""}
                    </button>
                  ))}
                </div>
              )}

              {mode === "cctv" && (
                <div className="cam-hint">
                  Ketuk pin kamera buat lihat siarannya. Pin bergaris putus = posisi perkiraan, pin abu =
                  lagi mati. Beberapa simpang kameranya dua — perbesar peta buat misahin pin.
                </div>
              )}

              {mode === "cctv" && UNMAPPED_CAMS.length > 0 && (
                <div className="cam-extra">
                  <span className="cam-extra-lab">Kamera lain (titik belum dipetakan)</span>
                  {UNMAPPED_CAMS.map((c) => (
                    <button key={c.slug} className="cam-chip" onClick={() => pickCam(c)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mode-switch" role="group" aria-label="Pilih tampilan">
              <button
                className={`mode-btn ${mode === "hujan" ? "active" : ""}`}
                onClick={() => switchMode("hujan")}
                aria-pressed={mode === "hujan"}
              >
                <svg className="mode-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d={DROP_PATH} />
                </svg>
                Hujan
              </button>
              <button
                className={`mode-btn ${mode === "ombak" ? "active" : ""}`}
                onClick={() => switchMode("ombak")}
                aria-pressed={mode === "ombak"}
              >
                <svg className="mode-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 8.5c1.8 0 1.8 2 3.6 2s1.8-2 3.6-2 1.8 2 3.6 2 1.8-2 3.6-2 1.8 2 3.6 2" />
                  <path d="M2 14c1.8 0 1.8 2 3.6 2s1.8-2 3.6-2 1.8 2 3.6 2 1.8-2 3.6-2 1.8 2 3.6 2" />
                </svg>
                Ombak
              </button>
              <button
                className={`mode-btn ${mode === "cctv" ? "active" : ""}`}
                onClick={() => switchMode("cctv")}
                aria-pressed={mode === "cctv"}
              >
                <svg className="mode-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={CAM_PATH_A} />
                  <path d={CAM_PATH_B} />
                </svg>
                CCTV
              </button>
            </div>

            {mode !== "cctv" && (
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
            )}

            {mode !== "cctv" && (
              <div className="transport">
                <button
                  className="play"
                  onClick={() => {
                    // mulai sweep dari frame-sekarang kalau lagi mentok di akhir
                    if (!playing && mode === "ombak" && ofsIdx >= ofsCount - 1) setOfsIdx(nowIndex);
                    setPlaying((p) => !p);
                  }}
                  disabled={mode === "hujan" ? !ready : !ofsReady}
                  aria-label={playing ? "Jeda" : "Putar"}
                  style={{ opacity: (mode === "hujan" ? ready : ofsReady) ? 1 : 0.5 }}
                >
                  {playing ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <input
                  className="rng"
                  type="range"
                  aria-label={mode === "ombak" ? "Waktu prakiraan gelombang" : "Penggeser waktu citra hujan"}
                  aria-valuetext={sliderValueText}
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
            )}

            {mode !== "cctv" && (
              <div className="meta">
                {mode === "ombak" ? (
                  <div className="ofs-legend">
                    <span className="ofs-lab">Tinggi gelombang signifikan (m) · BMKG</span>
                    <div className="ofs-bar" style={{ background: OFS_GRADIENT }} />
                    <div className="ofs-ticks">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((m) => (
                        <span key={m}>{m}</span>
                      ))}
                    </div>
                    <div className="ofs-cats">
                      {OFS_CATEGORIES.map((c, i) => (
                        <span key={c.label}>
                          {c.label}{" "}
                          {i === OFS_CATEGORIES.length - 1 ? `>${fmtM(c.from)}` : `${fmtM(c.from)}–${fmtM(c.to)}`}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <label className="opacity">
                      Kepekatan
                      <input
                        className="rng"
                        type="range"
                        aria-label="Kepekatan overlay radar"
                        aria-valuetext={`${Math.round(opacity * 100)}%`}
                        min={0.3}
                        max={1}
                        step={0.05}
                        value={opacity}
                        onChange={(e) => setOpacity(Number(e.target.value))}
                      />
                    </label>
                    <div className="legend" title={`Skala MSS: ringan → sedang → lebat · resolusi radar ~${RADAR_KM_PER_PX} km`}>
                      <span className="lab">{LEGEND_LABELS[0]}</span>
                      <div className="bar" style={{ background: RAIN_GRADIENT }} />
                      <span className="lab">{LEGEND_LABELS[2]}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="credit">
              Radar:{" "}
              <a href="https://www.weather.gov.sg/weather-rain-area-240km" target="_blank" rel="noopener noreferrer">
                MSS Singapura
              </a>{" "}
              · Cuaca:{" "}
              <a href="https://data.gov.sg" target="_blank" rel="noopener noreferrer">
                NEA
              </a>{" "}
              · Laut:{" "}
              <a href="https://maritim.bmkg.go.id" target="_blank" rel="noopener noreferrer">
                BMKG OFS
              </a>{" "}
              · CCTV: Pemko Batam · Peta: © OpenStreetMap, CARTO
              <span className="privacy">
                Tanpa pelacak. Data ditarik langsung ke perangkatmu dari sumber di atas. Resolusi radar ~
                {RADAR_KM_PER_PX} km.
              </span>
            </div>
          </div>
        )}
        <div className="sr-only" role="status" aria-live="polite">
          {liveText}
        </div>
      </section>

      {activeCam && (
        <CctvPlayer key={activeCam.slug} cam={activeCam} onClose={closeCam} onDead={onDead} autoStart={camAutoStart} />
      )}

      <IosInstallHint />
    </div>
  );
}
