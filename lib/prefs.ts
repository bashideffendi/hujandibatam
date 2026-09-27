// Preferensi pengguna di localStorage. Semua akses dibungkus try/catch: mode privat,
// kuota penuh, atau storage yang diblokir tidak boleh menjatuhkan app.
export const PREF = {
  theme: "hujan-theme",
  mode: "hujan-mode",
  view: "hujan-view",
  collapsed: "hujan-collapsed",
  detail: "hujan-detail",
  recentCams: "hujan-cams-recent",
} as const;

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* abaikan */
  }
}
