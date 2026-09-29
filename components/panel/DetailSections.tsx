import type { EchoSummary, ForecastResponse, PerairanResponse } from "@/lib/api-types";
import { KEC_RAIN_MIN_KM2, type RainScope } from "@/lib/kecamatan";
import { KAB_LIST, kecTable, perairanDetail, type ForecastStripView, type KecRow } from "@/lib/status";
import { WeatherIcon } from "../icons";

function KecGrid({ rows }: { rows: KecRow[] }) {
  return (
    <ul className="kec-grid">
      {rows.map((r) => (
        <li key={r.code} data-rain={r.level ? "" : undefined}>
          <span className="kec-n">{r.name}</span>
          <span className="kec-s">
            {r.level && <span className="answer-dot" data-level={r.level} aria-hidden />}
            {r.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Status tiap kecamatan dari citra radar terbaru, dalam cakupan wilayah yang dipilih
 * (Kota Batam, atau semua kab/kota Kepri dikelompokkan). Yang hujan di atas (berlatar),
 * sisanya tipis. Judul menyebut jamnya kalau citra terbaru tidak segar.
 */
export function KecTable({
  echo,
  when,
  fresh,
  scope,
}: {
  echo: EchoSummary | null;
  when: string;
  fresh: boolean;
  scope: RainScope;
}) {
  const groups = kecTable(echo, scope);
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  const rainy = groups.reduce((s, g) => s + g.rainy, 0);
  const multi = groups.length > 1;
  return (
    <section className="d-sec">
      <h3 className="d-title">
        {fresh || !when ? "Hujan per Kecamatan" : `Hujan per Kecamatan, ${when}`}
        {total > 0 && (
          <small>
            {rainy} dari {total}
          </small>
        )}
      </h3>
      {!total ? (
        <p className="d-note">Deteksi hujan otomatis sedang gangguan, jadi lihat warna di peta.</p>
      ) : multi ? (
        groups.map((g) => (
          <div key={g.kab} className="kec-group">
            <h4 className="kec-kab">
              {g.kab === "Batam" || g.kab === "Tanjungpinang" ? `Kota ${g.kab}` : `Kabupaten ${g.kab}`}
              <small>{g.rainy ? `${g.rainy} dari ${g.rows.length} Hujan` : "Tidak Hujan"}</small>
            </h4>
            <KecGrid rows={g.rows} />
          </div>
        ))
      ) : (
        <KecGrid rows={groups[0].rows} />
      )}
      <p className="d-note">
        Dihitung dari radar MSS (1 piksel ≈ 1 km²) di atas daratan tiap kecamatan, jadi hujan di laut tidak
        ikut. Kecamatan disebut hujan kalau luasnya minimal {KEC_RAIN_MIN_KM2} km².{" "}
        {total > 0 &&
          (scope === "batam"
            ? `Tabel ini berisi ${total} kecamatan Kota Batam; pilih Wilayah Kepri untuk melihat Tanjungpinang, Bintan, Karimun, dan Lingga. `
            : `Mencakup ${KAB_LIST}; Natuna, Anambas, dan Kecamatan Tambelan (Kabupaten Bintan) di luar jangkauan radar. `)}
        Ini perkiraan radar dari pantulan butiran air, jadi bisa beda dengan yang kamu rasakan.
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
export function PerairanInfo({ p, error, now }: { p: PerairanResponse | null; error: boolean; now: number }) {
  const rows = perairanDetail(p, now);
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
