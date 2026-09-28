import type { EchoSummary, ForecastResponse, PerairanResponse } from "@/lib/api-types";
import { BATAM_BOX_KM } from "@/lib/radar";
import { perairanDetail, rainDetail, type ForecastStripView } from "@/lib/status";

/**
 * Detail HUJAN: apa itu "sekitar Batam", seberapa luas hujannya, dan batas kejujuran radar.
 * Judul hanya "Sekarang" kalau citra terbaru segar; kalimat garis putus hanya saat garisnya tampil.
 */
export function RadarNow({ echo, time, fresh, boxShown }: { echo: EchoSummary | null; time?: string; fresh: boolean; boxShown: boolean }) {
  const d = rainDetail(echo);
  return (
    <section className="d-sec">
      <h3 className="d-title">{fresh || !time ? "Radar Sekarang" : `Radar Terakhir, ${time} WIB`}</h3>
      <div className="d-text">
        <p>
          {boxShown
            ? `Sekitar Batam = kotak garis putus di peta, kira-kira ${BATAM_BOX_KM} × ${BATAM_BOX_KM} km.`
            : `Sekitar Batam = kotak kira-kira ${BATAM_BOX_KM} × ${BATAM_BOX_KM} km di sekeliling Pulau Batam. Garisnya tampil saat peta menampilkan radar terbaru.`}
        </p>
        <p>{d.coverage}</p>
        {d.strongest && <p>{d.strongest}</p>}
        <p className="d-muted">
          Ini perkiraan radar MSS dari pantulan butiran air, jadi bisa beda dengan yang kamu rasakan.
        </p>
      </div>
    </section>
  );
}

/** Detail HUJAN: asal prakiraan BMKG dan istilahnya. */
export function ForecastInfo({ fc, strip }: { fc: ForecastResponse | null; strip: ForecastStripView }) {
  if (!fc && !strip.note) return null;
  return (
    <section className="d-sec">
      <h3 className="d-title">Prakiraan BMKG</h3>
      <div className="d-text">
        {strip.note && <p>{strip.note}</p>}
        {fc?.detail && <p>Prakiraan per 3 jam untuk Kelurahan {fc.detail}.</p>}
        {strip.hasHaze && (
          <p className="d-muted">
            Udara Kabur: istilah BMKG untuk jarak pandang berkurang oleh asap, debu, atau uap air.
          </p>
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
      <h3 className="d-title">Prakiraan Perairan Batam (BMKG)</h3>
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
