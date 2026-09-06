"use client";

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import { MAPPED_CAMS, type Cam } from "@/lib/cctv";

// Pin kamera di peta. Ikon dibikin sekali (divIcon) — murah, nggak narik apa-apa
// dari jaringan. Stream baru jalan pas pin diklik (lihat CctvPlayer).
const PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h6A2.5 2.5 0 0 1 14 8.5v7A2.5 2.5 0 0 1 11.5 18h-6A2.5 2.5 0 0 1 3 15.5Z"/><path d="M14 10.5 21 7v10l-7-3.5Z"/></svg>`;

// Beberapa kamera duduk di satu titik yang sama (dua kamera satu simpang, beda
// arah hadap) → pin-nya bakal saling numpuk dan cuma yang teratas bisa diklik.
// Solusinya dikipas SAAT RENDER, bukan dengan mengarang koordinat di data:
// tiap anggota grup digeser ~35 m mengelilingi titik aslinya.
const FAN_RADIUS = 0.00032; // derajat (~35 m di ekuator)

function fanOut(cams: Cam[]): { cam: Cam; pos: [number, number] }[] {
  const groups = new Map<string, Cam[]>();
  for (const c of cams) {
    const key = `${c.lat!.toFixed(5)},${c.lng!.toFixed(5)}`;
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const out: { cam: Cam; pos: [number, number] }[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push({ cam: g[0], pos: [g[0].lat as number, g[0].lng as number] });
      continue;
    }
    g.forEach((c, i) => {
      const a = (2 * Math.PI * i) / g.length - Math.PI / 2; // mulai dari atas
      // lng dikoreksi cos(lat) biar kipasnya bulat, bukan lonjong.
      const lat = (c.lat as number) + FAN_RADIUS * Math.sin(a);
      const lng =
        (c.lng as number) +
        (FAN_RADIUS * Math.cos(a)) / Math.cos(((c.lat as number) * Math.PI) / 180);
      out.push({ cam: c, pos: [lat, lng] });
    });
  }
  return out;
}

export default function CctvLayer({ onPick }: { onPick: (cam: Cam) => void }) {
  const placed = useMemo(() => fanOut(MAPPED_CAMS), []);
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
      {placed.map(({ cam, pos }) => (
        <Marker
          key={cam.slug}
          position={pos}
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
