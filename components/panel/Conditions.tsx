import type { ConditionsResponse } from "@/lib/api-types";
import { arahLengkap, titleCase } from "@/lib/status";
import { IconWind } from "../icons";

const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

// Data stasiun NEA Singapura — PEMBANDING, bukan pengukuran Batam. Judul bagiannya
// menyebut itu terang-terangan supaya tidak dibaca sebagai kondisi Batam.
export default function Conditions({ data, error }: { data: ConditionsResponse | null; error: boolean }) {
  const { nowcast, rain, aq, uv, wind } = data ?? {};
  const any = !!(nowcast || rain || aq || uv || wind);
  if (!any && !error) return null;
  return (
    <section className="d-sec">
      <h3 className="d-title">Pembanding dari Singapura (NEA)</h3>
      {!any ? (
        <p className="d-note">Data pembanding Singapura sedang tidak tersedia.</p>
      ) : (
        <>
          <dl className="kv">
            {nowcast && (
              <div>
                <dt>Prakiraan 2 Jam</dt>
                <dd>
                  {titleCase(nowcast.text)}, Area {nowcast.area}
                </dd>
              </div>
            )}
            {rain && (
              <div>
                <dt>Hujan 5 Menit</dt>
                <dd>
                  {nf1.format(rain.mm)} mm di Stasiun {rain.station}
                </dd>
              </div>
            )}
            {aq && (
              <div>
                <dt>Udara</dt>
                <dd>
                  <span className="kv-dot" style={{ background: aq.color }} aria-hidden />
                  {titleCase(aq.label)} (PSI {aq.psi})
                </dd>
              </div>
            )}
            {uv && (
              <div>
                <dt>UV</dt>
                <dd>
                  {uv.value}, {titleCase(uv.label)}
                </dd>
              </div>
            )}
            {wind && (
              <div>
                <dt>Angin</dt>
                <dd>
                  <IconWind className="wind-arrow" deg={wind.deg} />
                  {wind.speed} km/j dari {arahLengkap(wind.label)}
                </dd>
              </div>
            )}
          </dl>
          {aq && <p className="d-note">PSI: indeks polusi udara Singapura, rata-rata 24 jam.</p>}
        </>
      )}
    </section>
  );
}
