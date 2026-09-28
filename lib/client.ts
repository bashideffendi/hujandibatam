// Pembacaan kondisi browser (client-only). Semua aman dipanggil saat `window` belum ada.

export const reduceMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Pengguna menyalakan Data Saver → jangan preload/pemanasan yang tidak diminta. */
export const saveData = () =>
  typeof navigator !== "undefined" &&
  !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

/** HP posisi landscape (tinggi ≤ 480): panel jadi side-sheet kanan (lihat globals.css). */
export const isSmallLandscape = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(max-height: 480px) and (orientation: landscape)").matches;

/** Layar lebar (≥900 px): panel mengambang di kiri bawah, peta di-frame ke kanannya. */
export const isWide = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 900px)").matches;

export const isAbort =(e: unknown) => (e as Error)?.name === "AbortError";
