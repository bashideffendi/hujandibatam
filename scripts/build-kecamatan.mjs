// ---------------------------------------------------------------------------
// Bangun data kecamatan Kepulauan Riau untuk app dari data/kecamatan-kepri.geojson
// (batas resmi Badan Informasi Geospasial, edisi Juni 2026). Jalankan ulang kalau sumber
// atau RADAR_BOUNDS berubah:
//
//   node scripts/build-kecamatan.mjs
//
// Hanya kecamatan yang ≥90% daratannya di dalam LINGKARAN jangkauan radar MSS (240 km dari
// pusat citra) yang dipakai — Natuna, Anambas, dan Tambelan di luar jangkauan, jadi hujannya
// memang tidak bisa dihitung.
//
// Hasil:
//   lib/kecamatan-geo.json  — geometri DISEDERHANAKAN (Douglas–Peucker: Batam ±33 m, kab/kota
//                             lain ±55 m; pulau kecil dibuang) + titik label, untuk peta (klien).
//   lib/kecamatan-mask.ts   — piksel radar (480×480, 1 km/px) yang jatuh di daratan tiap
//                             kecamatan + bobot pecahannya (sub-sampel 4×4 per piksel, jadi
//                             piksel pantai dihitung sebagian). Dipakai server (lib/echo.ts).
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";

// HARUS sama dengan RADAR_BOUNDS di lib/radar.ts (dicek saat runtime di lib/echo.ts).
const BOUNDS = [
  [-0.811, 101.782],
  [3.524, 106.146],
];
const W = 480;
const H = 480;
const SUB = 4; // sub-sampel per sumbu per piksel
const RADAR_R_PX = 240; // jangkauan 240 km = 240 px dari pusat citra
const MIN_COVER = 0.9; // kecamatan dipakai kalau ≥90% daratannya terjangkau radar
// Batam dilihat sampai zoom 12 (±38 m/px); kab/kota lain biasanya zoom 9–11.
const SIMPLIFY_DEG = { Batam: 0.0003, default: 0.0005 };
const MIN_RING_KM2 = { Batam: 0.01, default: 0.03 };
// Urutan kab/kota di UI (Batam dulu, lalu dari yang terdekat).
const KAB_ORDER = ["Batam", "Tanjungpinang", "Bintan", "Karimun", "Lingga", "Anambas", "Natuna"];

const src = JSON.parse(readFileSync(new URL("../data/kecamatan-kepri.geojson", import.meta.url), "utf8"));

// ---- geometri -------------------------------------------------------------
const KM_LAT = 110.57;
const kmLng = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);
function ringAreaKm2(ring) {
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    a += x1 * kmLng(lat0) * y2 * KM_LAT - x2 * kmLng(lat0) * y1 * KM_LAT;
  }
  return Math.abs(a) / 2;
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// poligon = [luar, ...lubang]
const inPoly = (x, y, poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h));
function bbox(ring) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return { w, s, e, n };
}
// Douglas–Peucker (derajat; cukup di lintang ~1°)
function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a];
    const [x2, y2] = pts[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-12;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
// Cincin tertutup (titik awal = akhir) dipecah di titik terjauh dari titik awal supaya
// Douglas–Peucker tidak mengukur jarak ke "garis" sepanjang nol.
function simplifyRing(ring, tol) {
  const open = ring.slice(0, -1);
  if (open.length < 4) return ring;
  let k = 1;
  let far = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > far) {
      far = d;
      k = i;
    }
  }
  const a = simplify(open.slice(0, k + 1), tol);
  const b = simplify([...open.slice(k), open[0]], tol);
  return [...a, ...b.slice(1)];
}
// Titik label: titik di dalam cincin terbesar yang paling jauh dari tepi (pencarian grid).
function labelPoint(ring) {
  const b = bbox(ring);
  const distToEdge = (x, y) => {
    let m = Infinity;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      const vx = x2 - x1;
      const vy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy || 1e-12)));
      m = Math.min(m, Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy)));
    }
    return m;
  };
  let best = null;
  const N = 40;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = b.w + ((b.e - b.w) * i) / N;
      const y = b.s + ((b.n - b.s) * j) / N;
      if (!inRing(x, y, ring)) continue;
      const d = distToEdge(x, y);
      if (!best || d > best.d) best = { x, y, d };
    }
  }
  return best ? [+best.y.toFixed(5), +best.x.toFixed(5)] : null;
}

const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
const all = src.features.map((f) => {
  const polys = polysOf(f.geometry);
  const outerAreas = polys.map((p) => ringAreaKm2(p[0]));
  const biggest = polys[outerAreas.indexOf(Math.max(...outerAreas))][0];
  return {
    code: f.properties.code,
    name: f.properties.name,
    kab: f.properties.kab,
    polys,
    boxes: polys.map((p) => bbox(p[0])),
    areaKm2: outerAreas.reduce((s, a) => s + a, 0),
    label: labelPoint(biggest),
  };
});

// ---- masker piksel radar (+ jangkauan) -------------------------------------
const [[S, Wl], [N, E]] = BOUNDS;
const lngAt = (px) => Wl + (px / W) * (E - Wl);
const latAt = (py) => N - (py / H) * (N - S);
const pxOf = (lng) => ((lng - Wl) / (E - Wl)) * W;
const pyOf = (lat) => ((N - lat) / (N - S)) * H;
const SUB2 = SUB * SUB;
function maskOf(k) {
  const m = new Map(); // indeks piksel → jumlah sub-sampel di daratan
  let inRadar = 0;
  let total = 0;
  for (let pi = 0; pi < k.polys.length; pi++) {
    const b = k.boxes[pi];
    const x0 = Math.max(0, Math.floor(pxOf(b.w)));
    const x1 = Math.min(W - 1, Math.floor(pxOf(b.e)));
    const y0 = Math.max(0, Math.floor(pyOf(b.n)));
    const y1 = Math.min(H - 1, Math.floor(pyOf(b.s)));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        let hits = 0;
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            if (inPoly(lngAt(px + (sx + 0.5) / SUB), latAt(py + (sy + 0.5) / SUB), k.polys[pi])) hits++;
          }
        }
        if (!hits) continue;
        total += hits;
        const r = Math.hypot(px + 0.5 - W / 2, py + 0.5 - H / 2);
        if (r > RADAR_R_PX) continue; // di luar lingkaran radar: tak ada data
        inRadar += hits;
        const i = py * W + px;
        m.set(i, (m.get(i) ?? 0) + hits);
      }
    }
  }
  return { m, cover: total ? inRadar / total : 0 };
}

const rows = [];
const dropped = [];
for (const k of all) {
  const { m, cover } = maskOf(k);
  if (cover < MIN_COVER) {
    dropped.push(`${k.kab}/${k.name} (${Math.round(cover * 100)}%)`);
    continue;
  }
  const idx = [...m.keys()].sort((a, b) => a - b);
  rows.push({
    code: k.code,
    name: k.name,
    kab: k.kab,
    landKm2: +(idx.reduce((s, i) => s + m.get(i), 0) / SUB2).toFixed(1),
    idx,
    w: idx.map((i) => m.get(i)),
  });
}
const kabRank = (kab) => KAB_ORDER.indexOf(kab) + 1 || 99;
rows.sort((a, b) => kabRank(a.kab) - kabRank(b.kab) || a.name.localeCompare(b.name, "id"));
const kept = new Set(rows.map((r) => r.code));

// ---- geometri klien (disederhanakan) --------------------------------------
const r4 = (v) => Math.round(v * 1e4) / 1e4; // ±11 m, cukup untuk garis di peta
const geo = {
  type: "FeatureCollection",
  features: all
    .filter((k) => kept.has(k.code))
    .sort((a, b) => kabRank(a.kab) - kabRank(b.kab) || a.name.localeCompare(b.name, "id"))
    .map((k) => {
      const tol = SIMPLIFY_DEG[k.kab] ?? SIMPLIFY_DEG.default;
      const minA = MIN_RING_KM2[k.kab] ?? MIN_RING_KM2.default;
      return {
        type: "Feature",
        properties: { code: k.code, name: k.name, kab: k.kab, label: k.label, areaKm2: +k.areaKm2.toFixed(1) },
        geometry: {
          type: "MultiPolygon",
          coordinates: k.polys
            .filter((p) => ringAreaKm2(p[0]) >= minA)
            .map((p) =>
              p
                .map((ring) => simplifyRing(ring, tol).map(([x, y]) => [r4(x), r4(y)]))
                .filter((ring) => ring.length >= 4),
            )
            .filter((p) => p.length && p[0].length >= 4),
        },
      };
    }),
};
writeFileSync(new URL("../lib/kecamatan-geo.json", import.meta.url), JSON.stringify(geo));

const ts = `// DIHASILKAN oleh scripts/build-kecamatan.mjs dari data/kecamatan-kepri.geojson
// (batas kecamatan Badan Informasi Geospasial, edisi Juni 2026). JANGAN diedit tangan —
// jalankan ulang skripnya.
//
// Tiap kecamatan (≥${MIN_COVER * 100}% daratannya dalam jangkauan radar): indeks piksel radar
// (y*${W}+x) yang menyentuh daratannya + bobot w (jumlah sub-sampel dari ${SUB2} yang jatuh di
// daratan kecamatan itu; w/${SUB2} = km² di piksel itu).
export const KEC_MASK_BOUNDS: [[number, number], [number, number]] = ${JSON.stringify(BOUNDS)};
export const KEC_MASK_SIZE = { w: ${W}, h: ${H}, sub2: ${SUB2} } as const;
export const KEC_MASK: { code: string; name: string; kab: string; landKm2: number; idx: number[]; w: number[] }[] =
  ${JSON.stringify(rows)};
`;
writeFileSync(new URL("../lib/kecamatan-mask.ts", import.meta.url), ts);

const byKab = {};
for (const r of rows) (byKab[r.kab] ??= []).push(r);
for (const [kab, list] of Object.entries(byKab)) {
  const land = list.reduce((s, r) => s + r.landKm2, 0);
  console.log(`${kab.padEnd(14)} ${String(list.length).padStart(2)} kecamatan, darat ${land.toFixed(0)} km²`);
}
console.log("tak terjangkau radar:", dropped.join(", ") || "-");
let [bw, bs, be, bn] = [Infinity, Infinity, -Infinity, -Infinity];
for (const k of all.filter((k) => kept.has(k.code)))
  for (const b of k.boxes) {
    bw = Math.min(bw, b.w);
    bs = Math.min(bs, b.s);
    be = Math.max(be, b.e);
    bn = Math.max(bn, b.n);
  }
console.log(`bbox terpakai: [[${bs.toFixed(3)}, ${bw.toFixed(3)}], [${bn.toFixed(3)}, ${be.toFixed(3)}]]`);
const pts = geo.features.reduce((s, f) => s + f.geometry.coordinates.reduce((a, p) => a + p.reduce((q, r) => q + r.length, 0), 0), 0);
console.log(`geo: ${geo.features.length} fitur, ${pts} titik, ${Math.round(Buffer.byteLength(JSON.stringify(geo)) / 1024)} KB; mask ${rows.reduce((s, r) => s + r.idx.length, 0)} piksel`);
