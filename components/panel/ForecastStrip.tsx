import type { ForecastStripView } from "@/lib/status";

// Prakiraan BMKG kelurahan, 3 slot ke depan. Dua versi dirender sekaligus; CSS yang
// memilih: grid 3 kolom biasa, satu baris "Nanti: …" di layar HP yang pendek (≤700 px).
export default function ForecastStrip({ place, strip }: { place: string; strip: ForecastStripView }) {
  if (!strip.slots.length) return null;
  return (
    <div className="fc">
      <div className="fc-full">
        <div className="fc-lab">Prakiraan BMKG {place}</div>
        <ul className="fc-slots">
          {strip.slots.map((s) => (
            <li key={s.time} className="fc-slot">
              <span className="fc-top">
                <b>{s.time}</b>
                {s.t !== null && <span className="fc-t">{s.t}°</span>}
              </span>
              <span className="fc-desc">{s.desc}</span>
            </li>
          ))}
        </ul>
      </div>
      {strip.inline && (
        <p className="fc-inline">
          <span className="sr-only">Prakiraan BMKG {place}. </span>
          {strip.inline}
        </p>
      )}
    </div>
  );
}
