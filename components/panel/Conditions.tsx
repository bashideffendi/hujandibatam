import type { ConditionsResponse } from "@/lib/api-types";
import { arahLengkap, titleCase } from "@/lib/status";
import { IconCloud, IconGauge, IconSunLine, IconWindLines, WeatherIcon } from "../icons";

const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

// Data stasiun NEA Singapura — PEMBANDING, bukan pengukuran Batam. Judul bagiannya
// menyebut itu terang-terangan supaya tidak dibaca sebagai kondisi Batam.
export default function Conditions({ data, error }: { data: ConditionsResponse | null; error: boolean }) {
  const { nowcast, rain, aq, uv, wind } = data ?? {};
  const any = !!(nowcast || rain || aq || uv || wind);
  if (!any && !error) return null;
  return (
    <section className="d-sec">
      <h3 className="d-title">
        Pembanding dari Singapura <small>NEA</small>
      </h3>
      {!any ? (
        <p className="d-note">Data pembanding Singapura sedang tidak tersedia.</p>
      ) : (
        <>
          <dl className="nea">
            {nowcast && (
              <div>
                <WeatherIcon desc={nowcast.text} className="nea-ico" />
                <div>
                  <dt>Prakiraan 2 Jam</dt>
                  <dd>
                    {titleCase(nowcast.text)}
                    <small>{nowcast.area}</small>
                  </dd>
                </div>
              </div>
            )}
            {wind && (
              <div>
                <IconWindLines className="nea-ico" />
                <div>
                  <dt>Angin</dt>
                  <dd>
                    {wind.speed} km/j
                    <small>dari {arahLengkap(wind.label)}</small>
                  </dd>
                </div>
              </div>
            )}
            {aq && (
              <div>
                <IconGauge className="nea-ico" />
                <div>
                  <dt>Kualitas Udara</dt>
                  <dd>
                    {titleCase(aq.label)}
                    <small>PSI {aq.psi}</small>
                  </dd>
                </div>
              </div>
            )}
            {uv && (
              <div>
                <IconSunLine className="nea-ico" />
                <div>
                  <dt>Indeks UV</dt>
                  <dd>
                    {uv.value}
                    <small>{titleCase(uv.label)}</small>
                  </dd>
                </div>
              </div>
            )}
            {rain && (
              <div>
                <IconCloud className="nea-ico" />
                <div>
                  <dt>Hujan 5 Menit</dt>
                  <dd>
                    {nf1.format(rain.mm)} mm
                    <small>Stasiun {rain.station}</small>
                  </dd>
                </div>
              </div>
            )}
          </dl>
          {aq && <p className="d-note">PSI: indeks polusi udara Singapura, rata-rata 24 jam.</p>}
        </>
      )}
    </section>
  );
}
