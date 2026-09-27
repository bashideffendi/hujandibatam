"use client";

import { Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useCallback, useMemo, useState } from "react";
import { MAPPED_CAMS, type Cam } from "@/lib/cctv";
import { reduceMotion } from "@/lib/client";
import { CCTV_MAX_ZOOM } from "@/lib/radar";
import { CAM_PATH_A, CAM_PATH_B } from "./icons";
import type { Padding } from "./MapController";

// Pin kamera di peta. Ikon dibikin per kamera (divIcon) — murah, nggak narik apa-apa
// dari jaringan. Stream baru jalan pas pin diklik (lihat CctvPlayer).
//
// Varian visual: biasa · perkiraan (ring putus-putus; koordinatnya bisa meleset ratusan
// meter) · mati (abu; status diketahui dari sesi ini, bukan hardcode) · KELOMPOK
// (lingkaran berangka). Area sentuh 44×44 (WCAG 2.5.8) walau visualnya lebih kecil.
const PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${CAM_PATH_A}"/><path d="${CAM_PATH_B}"/></svg>`;

// Beberapa kamera duduk di satu titik yang sama (dua kamera satu simpang, beda arah
// hadap). Dikipas SAAT RENDER (bukan dengan mengarang koordinat di data): tiap anggota
// digeser ~45 m mengelilingi titik aslinya — jarak yang masuk akal untuk dua tiang di
// satu simpang.
const FAN_RADIUS = 0.0004;

// Pin yang jaraknya di layar < 40 px digabung jadi satu kelompok berangka. Di zoom awal
// (kota) 10 kamera Batam Kota cuma berjarak ~20 px — tanpa ini jadi gumpalan yang tak
// bisa dipilih. Di zoom maksimum tidak pernah digabung, supaya tiap kamera pasti terjangkau.
const CLUSTER_PX = 40;

type Placed = { cam: Cam; pos: [number, number] };
type Group = { key: string; members: Placed[]; center: [number, number] };

function fanOut(cams: Cam[]): Placed[] {
  const groups = new Map<string, Cam[]>();
  for (const c of cams) {
    const key = `${c.lat!.toFixed(5)},${c.lng!.toFixed(5)}`;
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const out: Placed[] = [];
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

function clusterize(placed: Placed[], map: L.Map, zoom: number): Group[] {
  if (zoom >= CCTV_MAX_ZOOM) {
    return placed.map((p) => ({ key: p.cam.slug, members: [p], center: p.pos }));
  }
  const pts = placed.map((p) => ({ p, px: map.project(p.pos, zoom) }));
  const used = new Array<boolean>(pts.length).fill(false);
  const out: Group[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const members = [pts[i]];
    let cx = pts[i].px.x;
    let cy = pts[i].px.y;
    for (let j = i + 1; j < pts.length; j++) {
      if (used[j]) continue;
      const dx = pts[j].px.x - cx;
      const dy = pts[j].px.y - cy;
      if (dx * dx + dy * dy > CLUSTER_PX * CLUSTER_PX) continue;
      used[j] = true;
      members.push(pts[j]);
      cx = members.reduce((s, m) => s + m.px.x, 0) / members.length;
      cy = members.reduce((s, m) => s + m.px.y, 0) / members.length;
    }
    out.push({
      key: members.map((m) => m.p.cam.slug).join("+"),
      members: members.map((m) => m.p),
      center: [
        members.reduce((s, m) => s + m.p.pos[0], 0) / members.length,
        members.reduce((s, m) => s + m.p.pos[1], 0) / members.length,
      ],
    });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function camIcon(cam: Cam, isDead: boolean) {
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

function clusterIcon(n: number, allDead: boolean) {
  return L.divIcon({
    className: "cam-hit",
    html: `<span class="cam-cluster${allDead ? " is-mati" : ""}" role="img" aria-label="${n} kamera berdekatan — ketuk untuk memperbesar">${n}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

type Props = {
  onPick: (cam: Cam) => void;
  /** slug → lastSeen (ms) kamera yang terbukti mati/beku di sesi ini. */
  dead: ReadonlyMap<string, number | null>;
  /** ruang yang tertutup panel/topbar — supaya kelompok yang diperbesar tidak tersembunyi. */
  getPadding: () => Padding;
};

export default function CctvLayer({ onPick, dead, getPadding }: Props) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const placed = useMemo(() => fanOut(MAPPED_CAMS), []);
  const groups = useMemo(() => clusterize(placed, map, zoom), [placed, map, zoom]);

  const zoomTo = useCallback(
    (g: Group) => {
      const b = L.latLngBounds(g.members.map((m) => L.latLng(m.pos[0], m.pos[1])));
      const opts = { ...getPadding(), maxZoom: CCTV_MAX_ZOOM };
      if (reduceMotion()) map.fitBounds(b, { ...opts, animate: false });
      else map.flyToBounds(b, { ...opts, duration: 0.6 });
    },
    [map, getPadding],
  );

  // Ikon dibuat ulang HANYA saat susunan kelompok atau status mati berubah — bukan tiap
  // render induk (yang terjadi tiap ~30 detik), supaya DOM marker tidak diganti sia-sia.
  const items = useMemo(
    () =>
      groups.map((g) => {
        if (g.members.length > 1) {
          const allDead = g.members.every((m) => dead.has(m.cam.slug));
          return {
            key: g.key,
            position: g.center,
            icon: clusterIcon(g.members.length, allDead),
            label: `${g.members.length} kamera`,
            group: g,
            cam: null as Cam | null,
          };
        }
        const { cam, pos } = g.members[0];
        const isDead = dead.has(cam.slug);
        return {
          key: cam.slug,
          position: pos,
          icon: camIcon(cam, isDead),
          label: `${cam.name}${cam.approx ? " · perkiraan" : ""}${isDead ? " · mati" : ""}`,
          group: g,
          cam,
        };
      }),
    [groups, dead],
  );

  return (
    <>
      {items.map((it) => (
        <Marker
          key={it.key}
          position={it.position}
          icon={it.icon}
          eventHandlers={{ click: () => (it.cam ? onPick(it.cam) : zoomTo(it.group)) }}
          keyboard
        >
          <Tooltip direction="top" offset={[0, -18]} className="cam-label">
            {it.label}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
