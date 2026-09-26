"use client";

import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import { MAPPED_CAMS, type Cam } from "@/lib/cctv";

// Pin kamera di peta. Ikon dibikin per kamera (divIcon) — murah, nggak narik apa-apa
// dari jaringan. Stream baru jalan pas pin diklik (lihat CctvPlayer).
//
// Tiga varian visual: biasa · perkiraan (ring putus-putus; koordinatnya bisa meleset
// ratusan meter) · mati (abu; status diketahui dari sesi ini, bukan hardcode).
// Area sentuh 44×44 (WCAG 2.5.8) walau visualnya 24 px.
const PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h6A2.5 2.5 0 0 1 14 8.5v7A2.5 2.5 0 0 1 11.5 18h-6A2.5 2.5 0 0 1 3 15.5Z"/><path d="M14 10.5 21 7v10l-7-3.5Z"/></svg>`;

// Beberapa kamera duduk di satu titik yang sama (dua kamera satu simpang, beda
// arah hadap) → pin-nya bakal saling numpuk dan cuma yang teratas bisa diklik.
// Solusinya dikipas SAAT RENDER, bukan dengan mengarang koordinat di data:
// tiap anggota grup digeser ~45 m mengelilingi titik aslinya. Bukan angka asal:
// dua kamera di satu simpang memang biasanya kepasang di tiang yang beda sudut.
const FAN_RADIUS = 0.0004;

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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function makeIcon(cam: Cam, isDead: boolean) {
  const cls = ["cam-pin", cam.approx ? "is-approx" : "", isDead ? "is-mati" : ""].filter(Boolean).join(" ");
  // Nama aksesibel per pin (prop `alt` Marker diabaikan Leaflet untuk divIcon).
  const label = `Kamera ${cam.name}${cam.approx ? " (posisi perkiraan)" : ""}${isDead ? " — lagi mati" : ""}`;
  return L.divIcon({
    className: "cam-hit",
    html: `<span class="${cls}" role="img" aria-label="${esc(label)}">${PIN_SVG}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

type Props = {
  onPick: (cam: Cam) => void;
  /** slug → lastSeen (ms) kamera yang terbukti mati/beku di sesi ini. */
  dead: ReadonlyMap<string, number | null>;
};

export default function CctvLayer({ onPick, dead }: Props) {
  const placed = useMemo(() => fanOut(MAPPED_CAMS), []);
  const icons = useMemo(
    () => new Map(placed.map((p) => [p.cam.slug, makeIcon(p.cam, dead.has(p.cam.slug))])),
    [placed, dead],
  );

  return (
    <>
      {placed.map(({ cam, pos }) => {
        const isDead = dead.has(cam.slug);
        return (
          <Marker
            key={cam.slug}
            position={pos}
            icon={icons.get(cam.slug)}
            eventHandlers={{ click: () => onPick(cam) }}
            keyboard
          >
            <Tooltip direction="top" offset={[0, -18]} className="cam-label">
              {cam.name}
              {cam.approx ? " · perkiraan" : ""}
              {isDead ? " · mati" : ""}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
