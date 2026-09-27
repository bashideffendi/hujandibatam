import {
  LEGEND,
  LEGEND_LABELS,
  OFS_CATEGORIES,
  OFS_MAX_M,
  OFS_SWH_COLORS,
  RADAR_KM_PER_PX,
} from "@/lib/radar";
import { fmtM } from "@/lib/status";

// Legend gelombang: HARD STOP per band (peta contourf memakai satu warna per band, bukan gradien).
const OFS_GRADIENT = `linear-gradient(to right, ${OFS_SWH_COLORS.map((s, i) => {
  const from = ((s.m / OFS_MAX_M) * 100).toFixed(1);
  const to = (((OFS_SWH_COLORS[i + 1]?.m ?? OFS_MAX_M) / OFS_MAX_M) * 100).toFixed(1);
  return `${s.c} ${from}% ${to}%`;
}).join(", ")})`;
// Legend hujan: ramp warna asli PNG MSS.
const RAIN_GRADIENT = `linear-gradient(to right, ${LEGEND.join(", ")})`;
const TICKS = Array.from({ length: OFS_MAX_M + 1 }, (_, i) => i);

/** Kepekatan overlay radar + legenda intensitas hujan (skala resmi MSS: ringan → lebat). */
export function RainMeta({ opacity, onOpacity }: { opacity: number; onOpacity: (v: number) => void }) {
  return (
    <div className="meta">
      <label className="opacity">
        Kepekatan
        <input
          className="rng"
          type="range"
          aria-label="Kepekatan overlay radar"
          aria-valuetext={`${Math.round(opacity * 100)}%`}
          min={0.3}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onOpacity(Number(e.target.value))}
        />
      </label>
      <div
        className="legend"
        title={`Skala MSS: ringan → sedang → lebat · resolusi radar ~${RADAR_KM_PER_PX} km`}
      >
        <span className="lab">{LEGEND_LABELS[0]}</span>
        <div className="bar" style={{ background: RAIN_GRADIENT }} />
        <span className="lab">{LEGEND_LABELS[2]}</span>
      </div>
    </div>
  );
}

/** Legenda tinggi gelombang signifikan (swh) + kategori resmi BMKG. */
export function OfsLegend() {
  return (
    <div className="meta">
      <div className="ofs-legend">
        <span className="ofs-lab">Tinggi gelombang signifikan (m) · BMKG</span>
        <div className="ofs-bar" style={{ background: OFS_GRADIENT }} />
        <div className="ofs-ticks">
          {TICKS.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <div className="ofs-cats">
          {OFS_CATEGORIES.map((c, i) => (
            <span key={c.label}>
              {c.label} {i === OFS_CATEGORIES.length - 1 ? `>${fmtM(c.from)}` : `${fmtM(c.from)}–${fmtM(c.to)}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
