const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

// Kredit sumber + catatan privasi, satu paragraf. Atribusi peta/radar/gelombang juga
// selalu tampil di kontrol atribusi Leaflet.
export default function Credit() {
  return (
    <p className="credit">
      Sumber: Radar{" "}
      <a href="https://www.weather.gov.sg/weather-rain-area-240km" {...ext}>
        MSS
      </a>{" "}
      dan Cuaca{" "}
      <a href="https://data.gov.sg" {...ext}>
        NEA
      </a>{" "}
      (Singapura), Prakiraan{" "}
      <a href="https://data.bmkg.go.id/prakiraan-cuaca/" {...ext}>
        Cuaca
      </a>{" "}
      dan{" "}
      <a href="https://maritim.bmkg.go.id" {...ext}>
        Gelombang
      </a>{" "}
      BMKG, Batas Kecamatan{" "}
      <a href="https://satudata.batam.go.id/data/peta" {...ext}>
        Satu Data Kota Batam
      </a>
      , Kamera Pemko Batam, Peta ©{" "}
      <a href="https://www.openstreetmap.org/copyright" {...ext}>
        OpenStreetMap
      </a>{" "}
      dan{" "}
      <a href="https://carto.com/attributions" {...ext}>
        CARTO
      </a>
      . Tanpa Pelacak.
    </p>
  );
}
