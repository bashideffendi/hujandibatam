// Satu sumber untuk semua ikon (SVG inline, ikut `currentColor`). Path kamera juga
// dipakai CctvLayer sebagai string HTML untuk divIcon Leaflet.
type P = { className?: string };

export const DROP_PATH = "M12 2.5c3.6 4.3 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.4-6.5 6-10.8Z";
export const CAM_PATH_A =
  "M3 8.5A2.5 2.5 0 0 1 5.5 6h6A2.5 2.5 0 0 1 14 8.5v7A2.5 2.5 0 0 1 11.5 18h-6A2.5 2.5 0 0 1 3 15.5Z";
export const CAM_PATH_B = "M14 10.5 21 7v10l-7-3.5Z";

const line = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const IconDrop = ({ className }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d={DROP_PATH} />
  </svg>
);
export const IconWave = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={1.8}>
    <path d="M2 8.5c1.8 0 1.8 2 3.6 2s1.8-2 3.6-2 1.8 2 3.6 2 1.8-2 3.6-2 1.8 2 3.6 2" />
    <path d="M2 14c1.8 0 1.8 2 3.6 2s1.8-2 3.6-2 1.8 2 3.6 2 1.8-2 3.6-2 1.8 2 3.6 2" />
  </svg>
);
export const IconCam = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={1.8}>
    <path d={CAM_PATH_A} />
    <path d={CAM_PATH_B} />
  </svg>
);
export const IconSun = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const IconMoon = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={1.8}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);
export const IconShare = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={1.8}>
    <path d="M12 15V3M8 6.5 12 3l4 3.5" />
    <path d="M6 11.5H5a1 1 0 0 0-1 1V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6.5a1 1 0 0 0-1-1h-1" />
  </svg>
);
export const IconInstall = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={1.8}>
    <path d="M12 3v12M7 11l5 4 5-4M5 21h14" />
  </svg>
);
export const IconChevronDown = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={2}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const IconChevronUp = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={2}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);
export const IconChevronRight = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={2}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const IconClose = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconWarn = ({ className }: P) => (
  <svg className={className} {...line} strokeWidth={2}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);
export const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);
export const IconPause = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
  </svg>
);
export const IconWind = ({ className, deg }: P & { deg: number }) => (
  // panah menunjuk arah angin PERGI; NEA/BMKG memberi arah DATANG → +180°
  <svg className={className} viewBox="0 0 24 24" style={{ transform: `rotate(${deg + 180}deg)` }} aria-hidden>
    <path d="M12 3l5 8h-3v8h-4v-8H7z" />
  </svg>
);
export const IconUv = ({ className, color }: P & { color: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="3.6" />
    <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" />
  </svg>
);
