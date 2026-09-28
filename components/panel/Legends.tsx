import { LEGEND, OFS_CATEGORIES, OFS_MAX_M, OFS_SWH_COLORS } from "@/lib/radar";
import { fmtM } from "@/lib/status";

// Legend gelombang: HARD STOP per band (peta contourf memakai satu warna per band, bukan gradien).
const OFS_GRADIENT = `linear-gradient(to right, ${OFS_SWH_COLORS.map((s, i) => {
  const from = ((s.m / OFS_MAX_M) * 100).toFixed(1);
  const to = (((OFS_SWH_COLORS[i + 1]?.m ?? OFS_MAX_M) / OFS_MAX_M) * 100).toFixed(1);
  return `${s.c} ${from}% ${to}%`;
}).join(", ")})`;
const TICKS = Array.from({ length: OFS_MAX_M + 1 }, (_, i) => i);

// Tiga kelas hujan = pembagian palet ASLI PNG MSS yang sama dengan hitungan server
// (lib/echo.ts): cyan–hijau = ringan, kuning–oranye = sedang, merah–magenta = lebat.
const RAIN_CLASSES = [
  { key: "ringan", label: "Ringan", colors: LEGEND.slice(0, 4) },
  { key: "sedang", label: "Sedang", colors: LEGEND.slice(4, 6) },
  { key: "lebat", label: "Lebat", colors: LEGEND.slice(6) },
] as const;

/** Skala warna radar di panel (selalu terlihat). */
export function RainScale() {
  return (
    <ul className="rain-scale" aria-label="Skala Warna Radar">
      {RAIN_CLASSES.map((c) => (
        <li key={c.key}>
          <i style={{ background: `linear-gradient(to right, ${c.colors.join(", ")})` }} aria-hidden />
          {c.label}
        </li>
      ))}
    </ul>
  );
}

/** Skala tinggi ombak di panel (selalu terlihat): band warna BMKG + meter. */
export function OfsScale() {
  return (
    <div className="ofs-scale" role="img" aria-label="Skala Tinggi Ombak, 0 sampai 7 meter">
      <div className="ofs-bar" style={{ background: OFS_GRADIENT }} />
      <div className="ofs-ticks" aria-hidden>
        {TICKS.map((m) => (
          <span key={m}>{m === OFS_MAX_M ? `${m} m` : m}</span>
        ))}
      </div>
    </div>
  );
}

/** Detail HUJAN: ketebalan warna radar. */
export function RainOpacity({ opacity, onOpacity }: { opacity: number; onOpacity: (v: number) => void }) {
  return (
    <section className="d-sec">
      <h3 className="d-title">Ketebalan Warna Radar</h3>
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
    </section>
  );
}

/** Detail OMBAK: kategori resmi BMKG + definisi tinggi ombak di peta. */
export function OfsCategories() {
  return (
    <section className="d-sec">
      <h3 className="d-title">Kategori Ombak BMKG (meter)</h3>
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
