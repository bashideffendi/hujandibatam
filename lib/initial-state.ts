// State awal app (client-only): URL (?mode=&view=&cam=) menang atas localStorage,
// dan semuanya divalidasi ketat terhadap daftar yang sah.
import { findCam, type Cam } from "./cctv";
import { PREF, readPref } from "./prefs";
import {
  DEFAULT_VIEW,
  VIEWS,
  VIEW_KEYS,
  timeBasedTheme,
  type Mode,
  type ThemeMode,
  type ViewKey,
} from "./radar";

export type InitialState = {
  mode: Mode;
  view: ViewKey;
  /** kamera dari link ?cam= (dibuka dengan tombol putar dulu, tidak auto-narik) */
  cam: Cam | null;
  collapsed: boolean;
  /** bagian Detail panel terbuka (hanya berpengaruh di layar sempit) */
  detail: boolean;
  themeOverride: ThemeMode | null;
  theme: ThemeMode;
  recentCams: Cam[];
};

function readRecentCams(): Cam[] {
  try {
    const raw = JSON.parse(readPref(PREF.recentCams) ?? "[]");
    return (Array.isArray(raw) ? raw : [])
      .map((s) => findCam(String(s)))
      .filter((c): c is Cam => !!c)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export function readInitialState(): InitialState {
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

  let mode: Mode = "hujan";
  if (cam) mode = "cctv";
  else if (urlMode) mode = urlMode;
  else {
    const s = readPref(PREF.mode);
    if (s === "ombak" || s === "cctv") mode = s;
  }

  let view: ViewKey = mode === "cctv" ? "batam" : DEFAULT_VIEW;
  const sv = readPref(PREF.view);
  if (urlView && VIEW_KEYS[mode].includes(urlView)) view = urlView;
  else if (sv && sv in VIEWS && VIEW_KEYS[mode].includes(sv as ViewKey)) view = sv as ViewKey;

  const st = readPref(PREF.theme);
  const themeOverride: ThemeMode | null = st === "light" || st === "dark" ? st : null;

  return {
    mode,
    view,
    cam,
    collapsed: readPref(PREF.collapsed) === "1",
    detail: readPref(PREF.detail) === "1",
    themeOverride,
    theme: themeOverride ?? timeBasedTheme(),
    recentCams: readRecentCams(),
  };
}
