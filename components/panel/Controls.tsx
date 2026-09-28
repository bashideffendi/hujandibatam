import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { VIEWS, type Mode, type ViewKey } from "@/lib/radar";
import type { Caption } from "@/lib/status";
import { IconChevronDown, IconPause, IconPlay } from "../icons";

const MODES: { key: Mode; label: string }[] = [
  { key: "hujan", label: "Hujan" },
  { key: "ombak", label: "Ombak" },
  { key: "cctv", label: "CCTV" },
];

/**
 * Pilihan mode = radiogroup: satu tombol aktif (tabindex 0), panah kiri/kanan pindah
 * sekaligus memilih. Tombol aktif putih bergaris, bukan biru — aksen hanya untuk data.
 */
export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const j = (i + step + MODES.length) % MODES.length;
    onChange(MODES[j].key);
    refs.current[j]?.focus();
  };
  return (
    <div className="mode-switch" role="radiogroup" aria-label="Pilih Tampilan">
      {MODES.map(({ key, label }, i) => (
        <button
          key={key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="mode-btn"
          role="radio"
          aria-checked={mode === key}
          tabIndex={mode === key ? 0 : -1}
          onClick={() => onChange(key)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Blok kontrol panel (Skala, Waktu, Wilayah): kisi dua kolom yang sama untuk tiap baris —
 * label atau tombol Putar di kiri, batang/penggeser/pilihan di kanan — supaya semua
 * kontrol berbagi satu tepi kiri dan kanan.
 */
export function ControlStack({ children }: { children: ReactNode }) {
  return <div className="ctl-stack">{children}</div>;
}

/** Pilihan wilayah peta — satu baris di panel (selalu terlihat), label di kolom kiri. */
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
    <div className="ctl-row view-row">
      <span className="ctl-lab" id="view-lab">
        Wilayah
      </span>
      <div
        className="segmented"
        role="group"
        aria-labelledby="view-lab"
        style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}
      >
        {keys.map((k) => (
          <button
            key={k}
            className="seg-btn"
            data-active={view === k}
            onClick={() => onChange(k)}
            aria-pressed={view === k}
          >
            {VIEWS[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}

type TransportProps = {
  playing: boolean;
  ready: boolean;
  onTogglePlay: () => void;
  playLabel: string;
  label: string;
  valueText: string;
  max: number;
  value: number;
  onScrub: (v: number) => void;
  caption: Caption;
  onToNow: () => void;
};

/**
 * Putar/Jeda + penggeser waktu, dengan caption kiri/kanan di bawah track (masih di
 * dalam tinggi 44 px). Di riwayat, sisi kanan jadi tombol "Ke Sekarang".
 */
export function Transport({
  playing,
  ready,
  onTogglePlay,
  playLabel,
  label,
  valueText,
  max,
  value,
  onScrub,
  caption,
  onToNow,
}: TransportProps) {
  const rangeRef = useRef<HTMLInputElement>(null);
  return (
    <div className="ctl-row transport">
      <button className="play" onClick={onTogglePlay} disabled={!ready} aria-label={playing ? "Jeda" : playLabel}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <div className="scrub">
        <input
          ref={rangeRef}
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
        <div className="caps">
          <span className="cap-left" data-warn={caption.warn || undefined}>
            {caption.left}
          </span>
          {caption.toNow ? (
            <button
              className="link-btn to-now"
              onClick={() => {
                onToNow();
                // tombol ini hilang begitu kembali ke sekarang → fokus jangan jatuh ke body
                rangeRef.current?.focus();
              }}
            >
              Ke Sekarang
            </button>
          ) : (
            caption.right && <span className="cap-right">{caption.right}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Baris bawah panel: pilihan mode + tombol Detail (Hujan/Ombak) atau Daftar (CCTV). */
export function Footer({
  mode,
  onMode,
  detailLabel,
  detail,
  onToggleDetail,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  detailLabel: string;
  detail: boolean;
  onToggleDetail: () => void;
}) {
  return (
    <div className="panel-foot">
      <ModeSwitch mode={mode} onChange={onMode} />
      <button className="detail-toggle" onClick={onToggleDetail} aria-expanded={detail} aria-controls="panel-detail">
        {detailLabel}
        <IconChevronDown className="detail-chevron" />
      </button>
    </div>
  );
}
