"use client";

import { Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAPPED_CAMS, type Cam } from "@/lib/cctv";
import { reduceMotion } from "@/lib/client";
import { CCTV_MAX_ZOOM } from "@/lib/radar";
import { CAM_PATH_A, CAM_PATH_B } from "./icons";
import type { Padding } from "./MapController";

// Pin kamera di peta. Ikon dibikin per kamera (divIcon) — murah, nggak narik apa-apa
// dari jaringan. Stream baru jalan pas kamera dipilih (lihat CctvPlayer).
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

// Pin yang jaraknya di layar < 30 px (visual pin 24 px + halo) digabung jadi kelompok.
// Jangkar kelompok TETAP (bukan centroid yang bergeser) dan dipilih dari titik terpadat
// dulu — cara lama (centroid bergeser, 40 px) merantai kamera sejauh beberapa km jadi
// satu gumpalan 21. Kelompok TIDAK dipecah dengan zoom: 7 kelompok memang berdempetan
// di dunia nyata (mis. 5 kamera sekitar alun-alun Engku Putri, <400 m; beberapa pasang
// satu simpang) dan baru terpisah di zoom 16–17. Jadi ketuk kelompok = DAFTAR kamera,
// langsung pilih — tanpa harus zoom.
const CLUSTER_PX = 30;
// Kelompok sampai 6 kamera → daftar pilihan. Lebih dari itu (cuma terjadi di zoom kota,
// mis. 21 kamera Batam Kota–Nagoya–Sekupang) → ketuk memperbesar peta, lalu kelompok
// kecilnya bisa dipilih dari daftar. Paling banyak dua ketukan sampai ke kamera.
const LIST_MAX = 6;

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
  const px = placed.map((p) => map.project(p.pos, zoom));
  const r2 = CLUSTER_PX * CLUSTER_PX;
  const near = (i: number, j: number) => {
    const dx = px[i].x - px[j].x;
    const dy = px[i].y - px[j].y;
    return dx * dx + dy * dy <= r2;
  };
  // jangkar = titik dengan tetangga terbanyak dulu → kelompok berpusat di titik terpadat
  const order = placed
    .map((_, i) => ({ i, n: placed.reduce((s, _p, j) => s + (near(i, j) ? 1 : 0), 0) }))
    .sort((a, b) => b.n - a.n)
    .map((o) => o.i);
  const used = new Array<boolean>(placed.length).fill(false);
  const out: Group[] = [];
  for (const i of order) {
    if (used[i]) continue;
    const idx = placed.map((_, j) => j).filter((j) => !used[j] && near(i, j));
    for (const j of idx) used[j] = true;
    const members = idx.map((j) => placed[j]).sort((a, b) => a.cam.name.localeCompare(b.cam.name, "id"));
    out.push({
      key: members.map((m) => m.cam.slug).join("+"),
      members,
      center:
        members.length === 1
          ? members[0].pos
          : [
              members.reduce((s, m) => s + m.pos[0], 0) / members.length,
              members.reduce((s, m) => s + m.pos[1], 0) / members.length,
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
  const hint = n > LIST_MAX ? "ketuk untuk memperbesar" : "ketuk untuk memilih";
  return L.divIcon({
    className: "cam-hit",
    html: `<span class="cam-cluster${allDead ? " is-mati" : ""}" role="img" aria-label="${n} kamera berdekatan — ${hint}">${n}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/**
 * Isi popup daftar. react-leaflet baru merender isi popup SESUDAH Leaflet membukanya, jadi
 * Leaflet menghitung posisi & auto-pan dengan isi kosong — daftar sempat keluar layar ke
 * atas. Komponen ini mount tepat saat isinya sudah ada di DOM, lalu meminta popup
 * menghitung ulang (update() = ukur ulang + geser peta supaya utuh terlihat) dan
 * memfokuskan pilihan pertama untuk pengguna keyboard.
 */
function FitOnMount({ popupRef, children }: { popupRef: { current: L.Popup | null }; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    popupRef.current?.update();
    el.current?.querySelector<HTMLButtonElement>(".cam-list-item")?.focus({ preventScroll: true });
  }, [popupRef]);
  return <div ref={el}>{children}</div>;
}

function ClusterPopup({
  count,
  pad,
  children,
}: {
  count: number;
  pad: Padding;
  children: ReactNode;
}) {
  const ref = useRef<L.Popup | null>(null);
  return (
    <Popup
      ref={ref}
      className="cam-list-popup"
      closeButton={false}
      minWidth={232}
      maxWidth={288}
      offset={[0, -14]}
      autoPanPaddingTopLeft={[pad.paddingTopLeft[0], pad.paddingTopLeft[1] + 8]}
      autoPanPaddingBottomRight={pad.paddingBottomRight}
    >
      <FitOnMount popupRef={ref}>
        <div className="cam-list" role="group" aria-label={`${count} kamera di titik ini`}>
          {children}
        </div>
      </FitOnMount>
    </Popup>
  );
}

type Props = {
  onPick: (cam: Cam) => void;
  /** slug → lastSeen (ms) kamera yang terbukti mati/beku di sesi ini. */
  dead: ReadonlyMap<string, number | null>;
  /** ruang yang tertutup panel/topbar — supaya daftar & kelompok tidak tersembunyi. */
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
      map.closePopup();
      const b = L.latLngBounds(g.members.map((m) => L.latLng(m.pos[0], m.pos[1])));
      const opts = { ...getPadding(), maxZoom: CCTV_MAX_ZOOM };
      if (reduceMotion()) map.fitBounds(b, { ...opts, animate: false });
      else map.flyToBounds(b, { ...opts, duration: 0.6 });
    },
    [map, getPadding],
  );

  const choose = useCallback(
    (cam: Cam) => {
      map.closePopup();
      onPick(cam);
    },
    [map, onPick],
  );

  // Ikon dibuat ulang HANYA saat susunan kelompok atau status mati berubah — bukan tiap
  // render induk (yang terjadi tiap ~30 detik), supaya DOM marker tidak diganti sia-sia.
  const items = useMemo(
    () =>
      groups.map((g) => {
        if (g.members.length > 1) {
          const allDead = g.members.every((m) => dead.has(m.cam.slug));
          return { key: g.key, position: g.center, icon: clusterIcon(g.members.length, allDead), group: g, cam: null };
        }
        const { cam, pos } = g.members[0];
        const isDead = dead.has(cam.slug);
        return {
          key: cam.slug,
          position: pos,
          icon: camIcon(cam, isDead),
          group: g,
          cam: cam as Cam | null,
          label: `${cam.name}${cam.approx ? " · perkiraan" : ""}${isDead ? " · mati" : ""}`,
        };
      }),
    [groups, dead],
  );

  const pad = getPadding();

  return (
    <>
      {items.map((it) =>
        !it.cam && it.group.members.length > LIST_MAX ? (
          <Marker
            key={it.key}
            position={it.position}
            icon={it.icon}
            eventHandlers={{ click: () => zoomTo(it.group) }}
            keyboard
          />
        ) : it.cam ? (
          <Marker
            key={it.key}
            position={it.position}
            icon={it.icon}
            eventHandlers={{ click: () => onPick(it.cam as Cam) }}
            keyboard
          >
            <Tooltip direction="top" offset={[0, -18]} className="cam-label">
              {"label" in it ? it.label : ""}
            </Tooltip>
          </Marker>
        ) : (
          <Marker key={it.key} position={it.position} icon={it.icon} keyboard>
            <ClusterPopup count={it.group.members.length} pad={pad}>
              <div className="cam-list-head">{it.group.members.length} kamera di sini</div>
              <ul>
                {it.group.members.map(({ cam }) => {
                  const isDead = dead.has(cam.slug);
                  return (
                    <li key={cam.slug}>
                      <button className={`cam-list-item${isDead ? " is-mati" : ""}`} onClick={() => choose(cam)}>
                        <span className="nm">{cam.name}</span>
                        <span className="meta">
                          {isDead ? "lagi mati" : cam.approx ? "posisi perkiraan" : cam.area}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button className="cam-list-zoom" onClick={() => zoomTo(it.group)}>
                Perbesar peta ke sini
              </button>
            </ClusterPopup>
          </Marker>
        ),
      )}
    </>
  );
}
