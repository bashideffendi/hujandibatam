import type { EchoSummary, ForecastResponse, PerairanResponse } from "@/lib/api-types";
import { KEC_RAIN_MIN_KM2, KEC_TOTAL } from "@/lib/kecamatan";
import { kecTable, perairanDetail, type ForecastStripView } from "@/lib/status";
import { WeatherIcon } from "../icons";

/**
 * Status tiap kecamatan dari citra radar terbaru: yang hujan di atas (berlatar), sisanya
 * tipis. Judul menyebut jamnya kalau citra terbaru tidak segar (terlambat/terputus/offline).
 */
export function KecTable({ echo, when, fresh }: { echo: EchoSummary | null; when: string; fresh: boolean }) {
  const rows = kecTable(echo);
  const rainy = rows.filter((r) => r.level).length;
  return (
    <section className="d-sec">
      <h3 className="d-title">
        {fresh || !when ? "Hujan per Kecamatan" : `Hujan per Kecamatan, ${when}`}
        {rows.length > 0 && (
          <small>
            {rainy} dari {KEC_TOTAL}
          </small>
        )}
      </h3>
      {rows.length ? (
        <ul className="kec-grid">
          {rows.map((r) => (
            <li key={r.name} data-rain={r.level ? "" : undefined}>
              <span className="kec-n">{r.name}</span>
              <span className="kec-s">
                {r.level && <span className="answer-dot" data-level={r.level} aria-hidden />}
                {r.text}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="d-note">Deteksi hujan otomatis sedang gangguan, jadi lihat warna di peta.</p>
      )}
      <p className="d-note">
        Dihitung dari radar MSS (1 piksel ≈ 1 km²) di atas daratan tiap kecamatan, jadi hujan di laut tidak
        ikut. Kecamatan disebut hujan kalau luasnya minimal {KEC_RAIN_MIN_KM2} km². Ini perkiraan radar dari
        pantulan butiran air, jadi bisa beda dengan yang kamu rasakan.
      </p>
    </section>
  );
}

/**
 * Prakiraan BMKG kelurahan. Petak 4 slot hanya tampil di sidebar laptop (di HP strip ringkas
 * sudah ada di panel utama); catatan istilah & kelurahan tampil di keduanya.
 */
export function ForecastSection({
  fc,
  tiles,
  note,
}: {
  fc: ForecastResponse | null;
  tiles: ForecastStripView;
  note: string | null;
}) {
  if (!fc && !note) return null;
  return (
    <section className="d-sec">
      <h3 className="d-title">
        Prakiraan BMKG {fc?.detail && <small>Kel. {fc.detail}</small>}
      </h3>
      {tiles.slots.length > 0 && (
        <ul className="fc-tiles">
          {tiles.slots.map((s) => (
            <li key={s.time}>
              <span className="fct-time">{s.time}</span>
              <WeatherIcon desc={s.desc} className="fct-ico" />
              {s.t !== null && <span className="fct-deg">{s.t}°</span>}
              <span className="fct-desc">{s.desc}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="d-text">
        {note && <p>{note}</p>}
        {tiles.hasHaze && (
          <p className="d-muted">Udara Kabur: istilah BMKG untuk jarak pandang berkurang oleh asap, debu, atau uap air.</p>
        )}
      </div>
    </section>
  );
}

/** Detail OMBAK: prakiraan teks resmi BMKG untuk perairan Batam. */
export function PerairanInfo({ p, error }: { p: PerairanResponse | null; error: boolean }) {
  const rows = perairanDetail(p);
  return (
    <section className="d-sec">
      <h3 className="d-title">
        Prakiraan Perairan Batam <small>BMKG</small>
      </h3>
      {rows.length ? (
        <dl className="kv">
          {rows.map((r) => (
            <div key={r.k}>
              <dt>{r.k}</dt>
              <dd>{r.v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="d-note">
          {error || p ? "Teks prakiraan perairan BMKG sedang tidak tersedia. Warna di peta tetap dari model BMKG." : "Memuat…"}
        </p>
      )}
    </section>
  );
}
