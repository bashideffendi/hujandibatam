// ---------------------------------------------------------------------------
// Bangun data kecamatan Kota Batam untuk app dari data/kecamatan-batam.geojson
// (batas resmi Satu Data Kota Batam). Jalankan ulang kalau sumber atau RADAR_BOUNDS berubah:
//
//   node scripts/build-kecamatan.mjs
//
// Hasil:
//   lib/kecamatan-geo.json  — geometri DISEDERHANAKAN (Douglas–Peucker ±33 m, pulau <0,01 km²
//                             dibuang) + titik label, untuk digambar di peta (klien).
//   lib/kecamatan-mask.ts   — piksel radar MSS (480×480, 1 km/px) yang jatuh di daratan tiap
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
const SIMPLIFY_DEG = 0.0003; // ±33 m — di bawah 1 piksel layar pada zoom 12 (±38 m)
const MIN_RING_KM2 = 0.01;

const src = JSON.parse(readFileSync(new URL("../data/kecamatan-batam.geojson", import.meta.url), "utf8"));

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
  const N = 48;
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

const r5 = (v) => Math.round(v * 1e5) / 1e5;
const r4 = (v) => Math.round(v * 1e4) / 1e4; // ±11 m, cukup untuk garis di peta
const kec = src.features.map((f) => {
  const rings = f.geometry.coordinates.map((poly) => poly[0]);
  const areas = rings.map(ringAreaKm2);
  const biggest = rings[areas.indexOf(Math.max(...areas))];
  return {
    name: f.properties.name,
    rings,
    boxes: rings.map(bbox),
    areaKm2: areas.reduce((s, a) => s + a, 0),
    label: labelPoint(biggest),
  };
});

// ---- geometri klien (disederhanakan) --------------------------------------
const geo = {
  type: "FeatureCollection",
  features: kec
    .map((k) => ({
      type: "Feature",
      properties: { name: k.name, label: k.label, areaKm2: +k.areaKm2.toFixed(1) },
      geometry: {
        type: "MultiPolygon",
        coordinates: k.rings
          .filter((r) => ringAreaKm2(r) >= MIN_RING_KM2)
          .map((r) => [simplifyRing(r, SIMPLIFY_DEG).map(([x, y]) => [r4(x), r4(y)])])
          .filter((p) => p[0].length >= 4),
      },
    }))
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, "id")),
};
writeFileSync(new URL("../lib/kecamatan-geo.json", import.meta.url), JSON.stringify(geo));

// ---- masker piksel radar --------------------------------------------------
const [[S, Wl], [N, E]] = BOUNDS;
const lngAt = (px) => Wl + (px / W) * (E - Wl);
const latAt = (py) => N - (py / H) * (N - S);
let all = { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity };
for (const k of kec)
  for (const b of k.boxes) {
    all = { w: Math.min(all.w, b.w), s: Math.min(all.s, b.s), e: Math.max(all.e, b.e), n: Math.max(all.n, b.n) };
  }
const x0 = Math.max(0, Math.floor(((all.w - Wl) / (E - Wl)) * W) - 1);
const x1 = Math.min(W - 1, Math.ceil(((all.e - Wl) / (E - Wl)) * W) + 1);
const y0 = Math.max(0, Math.floor(((N - all.n) / (N - S)) * H) - 1);
const y1 = Math.min(H - 1, Math.ceil(((N - all.s) / (N - S)) * H) + 1);
const masks = kec.map(() => new Map());
for (let py = y0; py <= y1; py++) {
  for (let px = x0; px <= x1; px++) {
    for (let sy = 0; sy < SUB; sy++) {
      for (let sx = 0; sx < SUB; sx++) {
        const lng = lngAt(px + (sx + 0.5) / SUB);
        const lat = latAt(py + (sy + 0.5) / SUB);
        // satu sub-sampel dimiliki paling banyak SATU kecamatan (batas digitasi bisa bertumpuk)
        for (let ki = 0; ki < kec.length; ki++) {
          const k = kec[ki];
          let hit = false;
          for (let r = 0; r < k.rings.length && !hit; r++) {
            const b = k.boxes[r];
            if (lng < b.w || lng > b.e || lat < b.s || lat > b.n) continue;
            hit = inRing(lng, lat, k.rings[r]);
          }
          if (hit) {
            const i = py * W + px;
            masks[ki].set(i, (masks[ki].get(i) ?? 0) + 1);
            break;
          }
        }
      }
    }
  }
}
const SUB2 = SUB * SUB;
const rows = kec
  .map((k, ki) => {
    const idx = [...masks[ki].keys()].sort((a, b) => a - b);
    const w = idx.map((i) => masks[ki].get(i));
    const land = w.reduce((s, v) => s + v, 0) / SUB2;
    return { name: k.name, landKm2: +land.toFixed(1), idx, w };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "id"));

const ts = `// DIHASILKAN oleh scripts/build-kecamatan.mjs dari data/kecamatan-batam.geojson
// (batas kecamatan Satu Data Kota Batam). JANGAN diedit tangan — jalankan ulang skripnya.
//
// Tiap kecamatan: indeks piksel radar (y*${W}+x) yang menyentuh daratannya + bobot w
// (jumlah sub-sampel dari ${SUB2} yang jatuh di daratan kecamatan itu; w/${SUB2} = km² di piksel itu).
export const KEC_MASK_BOUNDS: [[number, number], [number, number]] = ${JSON.stringify(BOUNDS)};
export const KEC_MASK_SIZE = { w: ${W}, h: ${H}, sub2: ${SUB2} } as const;
export const KEC_MASK: { name: string; landKm2: number; idx: number[]; w: number[] }[] = ${JSON.stringify(rows)};
`;
writeFileSync(new URL("../lib/kecamatan-mask.ts", import.meta.url), ts);

for (const r of rows) console.log(`${r.name.padEnd(16)} darat ${String(r.landKm2).padStart(6)} km²  piksel ${r.idx.length}`);
const geoBytes = Buffer.byteLength(JSON.stringify(geo));
const pts = geo.features.reduce((s, f) => s + f.geometry.coordinates.reduce((a, p) => a + p[0].length, 0), 0);
console.log(`geo: ${pts} titik, ${Math.round(geoBytes / 1024)} KB`);
