import type { ReactNode } from "react";

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

// Kredit sumber + catatan privasi sebagai bagian Detail tersendiri: satu baris per sumber
// (label → pemilik data), sama dengan daftar label → nilai lain di panel. Atribusi
// peta/radar/gelombang juga tampil di kontrol atribusi Leaflet.
const ROWS: { k: string; v: ReactNode }[] = [
  {
    k: "Radar Hujan",
    v: (
      <a href="https://www.weather.gov.sg/weather-rain-area-240km" {...ext}>
        MSS Singapura
      </a>
    ),
  },
  {
    k: "Pembanding",
    v: (
      <a href="https://data.gov.sg" {...ext}>
        NEA Singapura
      </a>
    ),
  },
  {
    k: "Prakiraan",
    v: (
      <a href="https://data.bmkg.go.id/prakiraan-cuaca/" {...ext}>
        BMKG
      </a>
    ),
  },
  {
    k: "Gelombang",
    v: (
      <a href="https://maritim.bmkg.go.id" {...ext}>
        BMKG
      </a>
    ),
  },
  {
    k: "Batas Kecamatan",
    v: (
      <>
        <a href="https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer" {...ext}>
          Badan Informasi Geospasial
        </a>
        <small>Edisi Juni 2026, Disederhanakan</small>
      </>
    ),
  },
  { k: "Kamera", v: "Pemko Batam" },
  {
    k: "Peta Dasar",
    v: (
      <>
        ©{" "}
        <a href="https://www.openstreetmap.org/copyright" {...ext}>
          OpenStreetMap
        </a>
        ,{" "}
        <a href="https://carto.com/attributions" {...ext}>
          CARTO
        </a>
      </>
    ),
  },
  { k: "Privasi", v: "Tanpa Pelacak" },
];

export default function Credit() {
  return (
    <section className="d-sec">
      <h3 className="d-title">Sumber Data</h3>
      <dl className="kv credit">
        {ROWS.map((r) => (
          <div key={r.k}>
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
