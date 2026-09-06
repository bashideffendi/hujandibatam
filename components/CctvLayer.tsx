"use client";

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import { MAPPED_CAMS, type Cam } from "@/lib/cctv";

// Pin kamera di peta. Ikon dibikin sekali (divIcon) — murah, nggak narik apa-apa
// dari jaringan. Stream baru jalan pas pin diklik (lihat CctvPlayer).
const PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h6A2.5 2.5 0 0 1 14 8.5v7A2.5 2.5 0 0 1 11.5 18h-6A2.5 2.5 0 0 1 3 15.5Z"/><path d="M14 10.5 21 7v10l-7-3.5Z"/></svg>`;

export default function CctvLayer({ onPick }: { onPick: (cam: Cam) => void }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<span class="cam-pin" role="img" aria-label="Kamera">${PIN_SVG}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    [],
  );

  return (
    <>
      {MAPPED_CAMS.map((cam) => (
        <Marker
          key={cam.slug}
          position={[cam.lat as number, cam.lng as number]}
          icon={icon}
          eventHandlers={{ click: () => onPick(cam) }}
          keyboard
          alt={`Kamera ${cam.name}`}
        >
          <Tooltip direction="top" offset={[0, -12]} className="cam-label">
            {cam.name}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
