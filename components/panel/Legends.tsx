import { LEGEND, LEGEND_LABELS, OFS_CATEGORIES, OFS_MAX_M, OFS_SWH_COLORS } from "@/lib/radar";
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

/** Ketebalan warna radar + legenda intensitas hujan (skala resmi MSS: ringan → lebat). */
export function RainMeta({ opacity, onOpacity }: { opacity: number; onOpacity: (v: number) => void }) {
  return (
    <section className="d-sec">
      <h3 className="d-title">Warna Hujan</h3>
      <label className="opacity">
        <span>Tipis</span>
        <input
          className="rng"
          type="range"
          aria-label="Ketebalan Warna Radar"
          aria-valuetext={`${Math.round(opacity * 100)}%`}
          min={0.3}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onOpacity(Number(e.target.value))}
        />
        <span>Tebal</span>
      </label>
      <div className="legend">
        <div className="legend-bar" style={{ background: RAIN_GRADIENT }} />
        <div className="legend-labs">
          {LEGEND_LABELS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Legenda tinggi gelombang signifikan + kategori resmi BMKG. */
export function OfsLegend() {
  return (
    <section className="d-sec">
      <h3 className="d-title">Tinggi Ombak (meter)</h3>
      <div className="ofs-bar" style={{ background: OFS_GRADIENT }} />
      <div className="ofs-ticks" aria-hidden>
        {TICKS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <ul className="ofs-cats">
        {OFS_CATEGORIES.map((c, i) => (
          <li key={c.label}>
            <b>{c.label}</b> {i === OFS_CATEGORIES.length - 1 ? `>${fmtM(c.from)}` : `${fmtM(c.from)}–${fmtM(c.to)}`}
          </li>
        ))}
      </ul>
      <p className="d-note">
        Tinggi ombak di peta adalah rerata sepertiga ombak tertinggi (gelombang signifikan) dari model BMKG.
      </p>
    </section>
  );
}
