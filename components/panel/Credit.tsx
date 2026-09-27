import { RADAR_KM_PER_PX } from "@/lib/radar";

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

// Kredit sumber + catatan privasi. Atribusi peta/radar/gelombang juga selalu tampil di
// kontrol atribusi Leaflet; kredit NEA ada di keterangan strip kondisi; CCTV di pemutar.
export default function Credit() {
  return (
    <div className="credit">
      Radar:{" "}
      <a href="https://www.weather.gov.sg/weather-rain-area-240km" {...ext}>
        MSS Singapura
      </a>{" "}
      · Cuaca:{" "}
      <a href="https://data.gov.sg" {...ext}>
        NEA
      </a>
      ,{" "}
      <a href="https://data.bmkg.go.id/prakiraan-cuaca/" {...ext}>
        BMKG
      </a>{" "}
      · Laut:{" "}
      <a href="https://maritim.bmkg.go.id" {...ext}>
        BMKG OFS
      </a>{" "}
      · CCTV: Pemko Batam · Peta: © OpenStreetMap, CARTO
      <span className="privacy">
        Tanpa pelacak. Data ditarik langsung ke perangkatmu dari sumber di atas. Resolusi radar ~
        {RADAR_KM_PER_PX} km.
      </span>
    </div>
  );
}
