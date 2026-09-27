import { VIEWS, type Mode, type ViewKey } from "@/lib/radar";
import { IconCam, IconChevronDown, IconDrop, IconPause, IconPlay, IconWave } from "../icons";

const MODES: { key: Mode; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { key: "hujan", label: "Hujan", Icon: IconDrop },
  { key: "ombak", label: "Ombak", Icon: IconWave },
  { key: "cctv", label: "CCTV", Icon: IconCam },
];

export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="mode-switch" role="group" aria-label="Pilih tampilan">
      {MODES.map(({ key, label, Icon }) => (
        <button
          key={key}
          className={`mode-btn ${mode === key ? "active" : ""}`}
          onClick={() => onChange(key)}
          aria-pressed={mode === key}
        >
          <Icon className="mode-ico" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function ViewSelector({
  keys,
  view,
  onChange,
}: {
  keys: ViewKey[];
  view: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  return (
    <div
      className="segmented"
      role="group"
      aria-label="Pilih cakupan"
      style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}
    >
      {keys.map((k) => (
        <button
          key={k}
          className={`seg-btn ${view === k ? "active" : ""}`}
          onClick={() => onChange(k)}
          aria-pressed={view === k}
        >
          {VIEWS[k].label}
          <span className="k">{VIEWS[k].sub}</span>
        </button>
      ))}
    </div>
  );
}

type TransportProps = {
  playing: boolean;
  ready: boolean;
  onTogglePlay: () => void;
  label: string;
  valueText: string;
  max: number;
  value: number;
  onScrub: (v: number) => void;
  detail: boolean;
  onToggleDetail: () => void;
};

/**
 * Baris timeline: Putar/Jeda + penggeser waktu + tombol Detail. Tombol Detail hanya
 * tampil di layar sempit (di layar lebar bagian detail selalu terbuka).
 */
export function Transport({
  playing,
  ready,
  onTogglePlay,
  label,
  valueText,
  max,
  value,
  onScrub,
  detail,
  onToggleDetail,
}: TransportProps) {
  return (
    <div className="transport">
      <button
        className="play"
        onClick={onTogglePlay}
        disabled={!ready}
        aria-label={playing ? "Jeda" : "Putar"}
        style={{ opacity: ready ? 1 : 0.5 }}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <input
        className="rng"
        type="range"
        aria-label={label}
        aria-valuetext={valueText}
        min={0}
        max={max}
        value={value}
        disabled={!ready}
        onChange={(e) => onScrub(Number(e.target.value))}
      />
      <button
        className="detail-toggle"
        onClick={onToggleDetail}
        aria-expanded={detail}
        aria-controls="panel-detail"
        aria-label={detail ? "Sembunyikan detail" : "Tampilkan detail: cakupan, kondisi, dan legenda"}
      >
        Detail
        <IconChevronDown className="detail-chevron" />
      </button>
    </div>
  );
}
