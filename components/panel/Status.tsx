import type { ReactNode } from "react";

type Props = {
  /** angka besar: jam, atau jumlah kamera */
  value: string;
  /** satuan kecil di samping angka: WIB / KAMERA */
  unit: string;
  date: string;
  /** tawarkan "Coba lagi" di samping teks tanggal */
  onRetry?: () => void;
  state: string;
  /** teks state berwarna peringatan (data tertunda/gangguan) */
  warn: boolean;
  dot: "live" | "dim" | "warn";
};

const DOT: Record<Props["dot"], string> = {
  live: "var(--live-dot)",
  dim: "var(--text-dim)",
  warn: "#f59e0b",
};

/** Blok status di puncak panel: waktu/jumlah di kiri, keadaan data di kanan. */
export function StatusBlock({ value, unit, date, onRetry, state, warn, dot }: Props) {
  return (
    <div className="status">
      <div>
        <div className="time">
          {value}
          <span className="wib">{unit}</span>
        </div>
        <div className="date">
          {date}
          {onRetry && (
            <>
              {" "}
              <button className="link-btn" onClick={onRetry}>
                Coba lagi
              </button>
            </>
          )}
        </div>
      </div>
      <div className={`state${warn ? " is-stale" : ""}`}>
        <span className="d" style={{ background: DOT[dot] }} />
        {state}
      </div>
    </div>
  );
}

/** Satu baris info selebar panel (echo radar, prakiraan BMKG, prakiraan perairan). */
export function InfoLine({ on, warn, children }: { on?: boolean; warn?: boolean; children: ReactNode }) {
  return (
    <div className={`info-line${on ? " is-on" : ""}${warn ? " has-warn" : ""}`}>
      <span className="d" />
      <span>{children}</span>
    </div>
  );
}
