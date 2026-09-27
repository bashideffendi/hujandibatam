import type { ConditionsResponse } from "@/lib/api-types";
import { IconDrop, IconUv, IconWind } from "../icons";

const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

// Strip kondisi dari stasiun NEA Singapura. SEMUANYA proksi buat Batam — keterangan itu
// ditampilkan sebagai teks (bukan cuma `title`, yang tak pernah muncul di layar sentuh).
export default function Conditions({ data, error }: { data: ConditionsResponse | null; error: boolean }) {
  if (!data) {
    return error ? <div className="conditions-err">Data cuaca tambahan lagi nggak tersedia</div> : null;
  }
  const { nowcast, rain, aq, uv, wind } = data;
  if (!nowcast && !rain && !aq && !uv && !wind) return null;
  return (
    <div className="conditions-wrap">
      <div className="conditions">
        {nowcast && (
          <span
            className={`chip${nowcast.rain ? " is-rain" : ""}`}
            title={`Prakiraan 2 jam NEA area ${nowcast.area}: ${nowcast.raw}`}
          >
            <IconDrop className="rain-ico" />
            2 jam <b>{nowcast.text}</b>
            <span className="chip-sub">SG · {nowcast.area}</span>
          </span>
        )}
        {rain && (
          <span
            className="chip is-rain"
            title={`Curah hujan 5 menit ${nf1.format(rain.mm)} mm di ${rain.station} — stasiun Singapura terdekat`}
          >
            <IconDrop className="rain-ico" />
            Hujan <b>{nf1.format(rain.mm)} mm</b>
            <span className="chip-sub">SG · {rain.station}</span>
          </span>
        )}
        {aq && (
          <span
            className="chip"
            title={`PSI (indeks polusi) 24 jam ${aq.psi}${
              aq.pm25 != null ? ` · PM2.5 24 jam ${aq.pm25} µg/m³` : ""
            } — region Singapura selatan`}
          >
            <span className="chip-dot" style={{ background: aq.color }} />
            Udara <b>{aq.psi}</b>
            <span className="chip-sub">{aq.label}</span>
          </span>
        )}
        {uv && (
          <span className="chip" title={`Indeks UV jam ini ${uv.value} (Singapura, lintang sama)`}>
            <IconUv className="uv-ico" color={uv.color} />
            UV <b>{uv.value}</b>
            <span className="chip-sub">{uv.label}</span>
          </span>
        )}
        {wind && (
          <span
            className="chip"
            title={`Angin ${wind.knots} knot dari ${wind.label}${wind.station ? ` · ${wind.station}` : ""}`}
          >
            <IconWind className="wind-arrow" deg={wind.deg} />
            Angin <b>{wind.speed} km/j</b>
            <span className="chip-sub">dari {wind.label}</span>
          </span>
        )}
      </div>
      <div className="conditions-note">Stasiun NEA Singapura terdekat · proksi buat Batam</div>
    </div>
  );
}
