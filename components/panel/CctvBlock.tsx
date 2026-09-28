import type { Cam } from "@/lib/cctv";

type Props = {
  recent: Cam[];
  dead: ReadonlyMap<string, number | null>;
  onPick: (cam: Cam) => void;
  /** petunjuk cara memilih, sampai kamera pertama dipilih */
  showHint: boolean;
};

// Isi panel mode CCTV di bawah jawaban: jalan pintas ke kamera yang terakhir dibuka
// (armada Pemko sering mati, jadi kamera yang sudah terbukti hidup berharga) dan
// petunjuk singkat. Kamera tanpa koordinat ada di Daftar.
export default function CctvBlock({ recent, dead, onPick, showHint }: Props) {
  if (!recent.length && !showHint) return null;
  return (
    <div className="cam-block">
      {recent.length > 0 && (
        <div className="cam-recent">
          <div className="cam-lab" id="cam-recent-lab">
            Baru Kamu Buka
          </div>
          <div className="chip-row" role="group" aria-labelledby="cam-recent-lab">
            {recent.map((c) => {
              const failed = dead.has(c.slug);
              return (
                <button key={c.slug} className="cam-chip" data-failed={failed || undefined} onClick={() => onPick(c)}>
                  {c.name}
                  {failed ? " · Gagal Tadi" : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {showHint && <p className="cam-hint">Ketuk Pin atau Angka untuk Memilih Kamera</p>}
    </div>
  );
}
