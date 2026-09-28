import type { EchoSummary, ForecastResponse, PerairanResponse } from "@/lib/api-types";
import { KEC_RAIN_MIN_KM2 } from "@/lib/kecamatan";
import { kecTable, perairanDetail, type ForecastStripView } from "@/lib/status";

/**
 * Detail HUJAN: status tiap kecamatan dari citra radar terbaru + cara menghitungnya.
 * Judul menyebut jamnya kalau citra terbaru tidak segar (terlambat/terputus/offline).
 */
export function KecTable({ echo, when, fresh }: { echo: EchoSummary | null; when: string; fresh: boolean }) {
  const rows = kecTable(echo);
  return (
    <section className="d-sec">
      <h3 className="d-title">{fresh || !when ? "Hujan per Kecamatan" : `Hujan per Kecamatan, ${when}`}</h3>
      {rows.length ? (
        <dl className="kv kv-kec">
          {rows.map((r) => (
            <div key={r.name}>
              <dt>{r.name}</dt>
              <dd data-rain={r.level ? "" : undefined}>
                {r.level && <span className="answer-dot" data-level={r.level} aria-hidden />}
                {r.text}
              </dd>
            </div>
          ))}
        </dl>
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
