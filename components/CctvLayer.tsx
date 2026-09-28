"use client";

import { Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { MAPPED_CAMS, type Cam } from "@/lib/cctv";
import { reduceMotion } from "@/lib/client";
import { CCTV_MAX_ZOOM } from "@/lib/radar";
import { CAM_PATH_A, CAM_PATH_B } from "./icons";
import type { Padding } from "./MapController";

// Pin kamera di peta. Ikon dibikin per kamera (divIcon) — murah, nggak narik apa-apa
// dari jaringan. Stream baru jalan pas kamera dipilih (lihat CctvPlayer).
//
// Varian visual: biasa · perkiraan (ring putus-putus; koordinatnya bisa meleset ratusan
// meter) · gagal diputar tadi (abu; dari sesi ini, bukan hardcode) · KELOMPOK (lingkaran
// berangka). Area sentuh 44×44 (WCAG 2.5.8) walau visualnya lebih kecil.
const PIN_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${CAM_PATH_A}"/><path d="${CAM_PATH_B}"/></svg>`;

// Beberapa kamera duduk di satu titik yang sama (dua kamera satu simpang, beda arah
// hadap). Dikipas di RUANG LAYAR saat render (bukan mengarang koordinat di data): tiap
// anggota digeser 24 px mengelilingi titik aslinya, dengan garis rambut ke titik asli.
// Dulu dikipas 45 m di bumi → di layar baru terpisah di zoom 16–17.
const FAN_PX = 24;

// Pengelompokan per UNIT = kamera-kamera di satu koordinat (dihitung dari titik ASLI, tanpa
// offset kipas), supaya kamera kembar tidak pernah terbelah antara gelembung dan pin. Unit
// yang jaraknya di layar ≤ 28 px digabung; jangkar TETAP dan dipilih dari unit terpadat
// (bobot = jumlah kamera) — cara lama (centroid bergeser, 40 px) merantai kamera sejauh
// beberapa km jadi satu gumpalan 21. Unit yang tak bergabung tampil sebagai pin (terkipas
// kalau kembar). Simulasi 28 koordinat: z11 (zoom buka HP) 12 penanda, kelompok 9/8/2,
// jarak minimum ±30 px; z16 tinggal satu pasangan (Southlink, 53 m); z17 semua terpisah.
const CLUSTER_PX = 28;
// Kelompok sampai 9 kamera → ketuk = daftar di panel. Lebih dari itu (cuma kalau
// pengguna zoom keluar sendiri) → ketuk memperbesar peta ke zoom 12.
export const LIST_MAX = 9;
const BIG_GROUP_ZOOM = 12;

type Placed = { cam: Cam; pos: [number, number]; off: [number, number]; site: string };
type Group = { key: string; members: Placed[]; center: [number, number] };

export type CamGroup = { key: string; cams: Cam[] };
export type CctvApi = {
  /** terbangkan peta ke kamera-kamera ini (bounds titik asli) */
  zoomToCams: (cams: Cam[], maxZoom: number) => void;
  /** fokuskan gelembung kelompok (sesudah daftar ditutup) */
  focusGroup: (key: string) => void;
};

function fanOut(cams: Cam[]): Placed[] {
  const groups = new Map<string, Cam[]>();
  for (const c of cams) {
    const key = `${c.lat!.toFixed(5)},${c.lng!.toFixed(5)}`;
    const g = groups.get(key);
    if (g) g.push(c);
    else groups.set(key, [c]);
  }
  const out: Placed[] = [];
  for (const [site, g] of groups) {
    g.forEach((c, i) => {
      const pos: [number, number] = [c.lat as number, c.lng as number];
      if (g.length === 1) {
        out.push({ cam: c, pos, off: [0, 0], site });
        return;
      }
      const a = (2 * Math.PI * i) / g.length - Math.PI / 2; // mulai dari atas
      out.push({ cam: c, pos, off: [FAN_PX * Math.cos(a), FAN_PX * Math.sin(a)], site });
    });
  }
  return out;
}

function clusterize(placed: Placed[], map: L.Map, zoom: number): Group[] {
  const single = (p: Placed): Group => ({ key: p.cam.slug, members: [p], center: p.pos });
  if (zoom >= CCTV_MAX_ZOOM) return placed.map(single);
  // unit = kamera-kamera di satu koordinat
  const unitMap = new Map<string, Placed[]>();
  for (const p of placed) {
    const u = unitMap.get(p.site);
    if (u) u.push(p);
    else unitMap.set(p.site, [p]);
  }
  const units = [...unitMap.values()];
  const px = units.map((u) => map.project(u[0].pos, zoom));
  const r2 = CLUSTER_PX * CLUSTER_PX;
  const near = (i: number, j: number) => {
    const dx = px[i].x - px[j].x;
    const dy = px[i].y - px[j].y;
    return dx * dx + dy * dy <= r2;
  };
  // jangkar = unit dengan kamera tetangga terbanyak dulu → kelompok berpusat di titik terpadat
  const order = units
    .map((_, i) => ({ i, n: units.reduce((s, u, j) => s + (near(i, j) ? u.length : 0), 0) }))
    .sort((a, b) => b.n - a.n)
    .map((o) => o.i);
  const used = new Array<boolean>(units.length).fill(false);
  const out: Group[] = [];
  for (const i of order) {
    if (used[i]) continue;
    const idx = units.map((_, j) => j).filter((j) => !used[j] && near(i, j));
    for (const j of idx) used[j] = true;
    // satu unit saja → pin tunggal (kamera kembar tampil terkipas, bukan gelembung)
    if (idx.length === 1) {
      for (const p of units[idx[0]]) out.push(single(p));
      continue;
    }
    const members = idx.flatMap((j) => units[j]).sort((a, b) => a.cam.name.localeCompare(b.cam.name, "id"));
    out.push({
      key: members.map((m) => m.cam.slug).join("+"),
      members,
      center: [
        members.reduce((s, m) => s + m.pos[0], 0) / members.length,
        members.reduce((s, m) => s + m.pos[1], 0) / members.length,
      ],
    });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function camIcon(cam: Cam, failed: boolean, off: [number, number]) {
  const [dx, dy] = off;
  const cls = ["cam-pin", cam.approx ? "is-approx" : "", failed ? "is-mati" : ""].filter(Boolean).join(" ");
  // Nama aksesibel per pin (prop `alt` Marker diabaikan Leaflet untuk divIcon).
  const label = `Kamera ${cam.name}${cam.approx ? ", posisi perkiraan" : ""}${failed ? ", gagal diputar tadi" : ""}`;
  // Pin terkipas: garis rambut dari pusat pin ke titik asli kamera.
  const line =
    dx || dy
      ? `<i class="cam-fan-line" style="width:${Math.hypot(dx, dy).toFixed(1)}px;transform:rotate(${Math.atan2(-dy, -dx).toFixed(4)}rad)"></i>`
      : "";
  return L.divIcon({
    className: "cam-hit",
    html: `${line}<span class="${cls}" role="img" aria-label="${esc(label)}">${PIN_SVG}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22 - dx, 22 - dy],
    tooltipAnchor: [dx, dy],
  });
}

function clusterIcon(n: number, allFailed: boolean, selected: boolean) {
  const hint = n > LIST_MAX ? "ketuk untuk memperbesar" : "ketuk untuk memilih";
  const cls = ["cam-cluster", allFailed ? "is-mati" : "", selected ? "is-selected" : ""].filter(Boolean).join(" ");
  return L.divIcon({
    className: "cam-hit",
    html: `<span class="${cls}" role="img" aria-label="${n} kamera berdekatan, ${hint}">${n}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

type Props = {
  onPick: (cam: Cam) => void;
  /** slug → lastSeen (ms) kamera yang gagal diputar di sesi ini. */
  dead: ReadonlyMap<string, number | null>;
  /** ruang yang tertutup panel/topbar — supaya kelompok tidak tersembunyi. */
  getPadding: () => Padding;
  /** kelompok ≤9 diketuk (daftar tampil di panel) / seleksi hilang (null) */
  onCluster: (g: CamGroup | null) => void;
  selectedKey: string | null;
  apiRef: MutableRefObject<CctvApi | null>;
  /** fokuskan jawaban panel (marker yang difokus hilang sesudah zoom) */
  focusPanel: () => void;
};

export default function CctvLayer({ onPick, dead, getPadding, onCluster, selectedKey, apiRef, focusPanel }: Props) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const markers = useRef(new Map<string, L.Marker>());
  const onClusterRef = useRef(onCluster);
  useEffect(() => {
    onClusterRef.current = onCluster;
  });
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    // ketuk peta kosong = tutup daftar kelompok
    click: () => {
      if (selectedKey) onClusterRef.current(null);
    },
  });

  const placed = useMemo(() => fanOut(MAPPED_CAMS), []);
  const groups = useMemo(() => clusterize(placed, map, zoom), [placed, map, zoom]);

  // API imperatif untuk panel (Perbesar Peta ke Sini, kembalikan fokus).
  useEffect(() => {
    apiRef.current = {
      zoomToCams: (cams, maxZoom) => {
        const pts = cams.filter((c) => c.lat != null && c.lng != null).map((c) => L.latLng(c.lat!, c.lng!));
        if (!pts.length) return;
        const opts = { ...getPadding(), maxZoom };
        const b = L.latLngBounds(pts);
        if (reduceMotion()) map.fitBounds(b, { ...opts, animate: false });
        else map.flyToBounds(b, { ...opts, duration: 0.6 });
      },
      focusGroup: (key) => {
        const el = markers.current.get(key)?.getElement();
        el?.focus({ preventScroll: true });
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, map, getPadding]);

  // Kelompok terpilih hilang (dipecah oleh zoom) → daftarnya ditutup.
  useEffect(() => {
    if (selectedKey && !groups.some((g) => g.key === selectedKey)) onClusterRef.current(null);
  }, [groups, selectedKey]);

  // Kelompok terpilih tetap terlihat di atas daftar: tunggu panel memanjang, lalu geser peta.
  useEffect(() => {
    if (!selectedKey) return;
    const g = groups.find((x) => x.key === selectedKey);
    if (!g) return;
    const t = window.setTimeout(() => {
      const pad = getPadding();
      map.panInside(L.latLng(g.center[0], g.center[1]), {
        paddingTopLeft: L.point(pad.paddingTopLeft[0] + 24, pad.paddingTopLeft[1] + 24),
        paddingBottomRight: L.point(pad.paddingBottomRight[0] + 24, pad.paddingBottomRight[1] + 8),
        animate: !reduceMotion(),
      });
    }, 90);
    return () => window.clearTimeout(t);
    // groups sengaja tidak jadi dependensi: geser sekali saat kelompok dipilih
  }, [selectedKey, map, getPadding]);

  // Ikon dibuat ulang HANYA saat susunan kelompok, status gagal, atau seleksi berubah —
  // bukan tiap render induk (yang terjadi tiap ~30 detik).
  const items = useMemo(
    () =>
      groups.map((g) => {
        if (g.members.length > 1) {
          const allFailed = g.members.every((m) => dead.has(m.cam.slug));
          return {
            key: g.key,
            position: g.center,
            icon: clusterIcon(g.members.length, allFailed, g.key === selectedKey),
            group: g,
            cam: null as Cam | null,
            label: "",
          };
        }
        const { cam, pos, off } = g.members[0];
        const failed = dead.has(cam.slug);
        return {
          key: g.key,
          position: pos,
          icon: camIcon(cam, failed, off),
          group: g,
          cam: cam as Cam | null,
          label: `${cam.name}${cam.approx ? " · Posisi Perkiraan" : ""}${failed ? " · Gagal Tadi" : ""}`,
        };
      }),
    [groups, dead, selectedKey],
  );

  // Gelembung ≤9 → daftar di panel; lebih dari itu → perbesar peta. Lewat keyboard, fokus
  // dipindah ke panel sesudah zoom (gelembung yang difokus dilepas saat pecah).
  const openGroup = (g: Group, viaKey = false) => {
    const cams = g.members.map((m) => m.cam);
    if (cams.length > LIST_MAX) {
      onCluster(null);
      if (viaKey) map.once("moveend", () => window.setTimeout(focusPanel, 30));
      apiRef.current?.zoomToCams(cams, BIG_GROUP_ZOOM);
    } else {
      onCluster({ key: g.key, cams });
    }
  };

  // Leaflet hanya mengubah Enter jadi klik untuk marker ber-popup → aktifkan sendiri
  // lewat keyboard (Enter/Spasi) supaya pin & gelembung bisa dipakai tanpa mouse.
  const onKey = (activate: () => void) => (e: L.LeafletKeyboardEvent) => {
    const k = e.originalEvent;
    if (k.key === "Enter" || k.key === " ") {
      k.preventDefault();
      activate();
    }
  };

  const setRef = (key: string) => (m: L.Marker | null) => {
    if (m) markers.current.set(key, m);
    else markers.current.delete(key);
  };

  return (
    <>
      {items.map((it) =>
        it.cam ? (
          <Marker
            key={it.key}
            ref={setRef(it.key)}
            position={it.position}
            icon={it.icon}
            eventHandlers={{ click: () => onPick(it.cam as Cam), keydown: onKey(() => onPick(it.cam as Cam)) }}
            keyboard
          >
            <Tooltip direction="top" offset={[0, -18]} className="cam-label">
              {it.label}
            </Tooltip>
          </Marker>
        ) : (
          <Marker
            key={it.key}
            ref={setRef(it.key)}
            position={it.position}
            icon={it.icon}
            zIndexOffset={it.key === selectedKey ? 1000 : 0}
            eventHandlers={{ click: () => openGroup(it.group), keydown: onKey(() => openGroup(it.group, true)) }}
            keyboard
          />
        ),
      )}
    </>
  );
}
