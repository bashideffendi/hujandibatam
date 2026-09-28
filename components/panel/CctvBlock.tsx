import { UNMAPPED_CAMS, type Cam } from "@/lib/cctv";

type Props = {
  recent: Cam[];
  dead: ReadonlyMap<string, number | null>;
  onPick: (cam: Cam) => void;
};

// Isi panel khusus mode CCTV: jalan pintas ke kamera yang terakhir dibuka (armada Pemko
// sering mati, jadi kamera yang sudah terbukti hidup berharga), petunjuk singkat, dan
// kamera yang belum punya koordinat terverifikasi.
export default function CctvBlock({ recent, dead, onPick }: Props) {
  return (
    <div className="cam-block">
      {recent.length > 0 && (
        <div className="cam-extra cam-recent">
          <span className="cam-extra-lab">Terakhir dibuka</span>
          {recent.map((c) => (
            <button
              key={c.slug}
              className={`cam-chip${dead.has(c.slug) ? " is-mati" : ""}`}
              onClick={() => onPick(c)}
            >
              {c.name}
              {dead.has(c.slug) ? " · mati" : ""}
            </button>
          ))}
        </div>
      )}
      <div className="cam-hint">
        Ketuk pin untuk menonton. Angka = beberapa kamera berdekatan, ketuk untuk memilih.
      </div>
      {UNMAPPED_CAMS.length > 0 && (
        <div className="cam-extra">
          <span className="cam-extra-lab">Kamera lain (titik belum dipetakan)</span>
          {UNMAPPED_CAMS.map((c) => (
            <button key={c.slug} className="cam-chip" onClick={() => onPick(c)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
