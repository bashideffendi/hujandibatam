import { CCTV_CREDIT, CCTV_MB_PER_MIN, MAPPED_CAMS, UNMAPPED_CAMS, type Cam } from "@/lib/cctv";
import { CAM_PATH_A, CAM_PATH_B, IconChevronRight } from "../icons";

type Props = {
  dead: ReadonlyMap<string, number | null>;
  onPick: (cam: Cam) => void;
};

// Kamera dikelompokkan per wilayah, urutan wilayah mengikuti data (lib/cctv.ts).
const BY_AREA: [string, Cam[]][] = (() => {
  const m = new Map<string, Cam[]>();
  for (const c of MAPPED_CAMS) {
    const list = m.get(c.area);
    if (list) list.push(c);
    else m.set(c.area, [c]);
  }
  return [...m.entries()].map(([area, cams]) => [area, [...cams].sort((a, b) => a.name.localeCompare(b.name, "id"))]);
})();

const PinSvg = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={CAM_PATH_A} />
    <path d={CAM_PATH_B} />
  </svg>
);

// Wilayah sudah jadi subjudul kelompok → sub-baris hanya untuk hal yang perlu diperhatikan.
function Row({ cam, failed, onPick }: { cam: Cam; failed: boolean; onPick: (c: Cam) => void }) {
  const sub = failed ? "Gagal Diputar Tadi" : cam.approx ? "Posisi Perkiraan" : null;
  return (
    <li>
      <button className="cam-row" data-failed={failed || undefined} onClick={() => onPick(cam)}>
        <span className="cam-row-txt">
          <span className="nm">{cam.name}</span>
          {sub && <span className="sub">{sub}</span>}
        </span>
        <IconChevronRight className="cam-row-chev" />
      </button>
    </li>
  );
}

/** Isi "Daftar" mode CCTV: semua kamera per wilayah, yang belum dipetakan, legenda pin, kredit. */
export default function CamDirectory({ dead, onPick }: Props) {
  return (
    <>
      <section className="d-sec">
        <h3 className="d-title">Semua Kamera</h3>
        {BY_AREA.map(([area, cams]) => (
          <div key={area} className="dir-area">
            <h4 className="dir-area-title">{area}</h4>
            <ul className="cam-rows">
              {cams.map((c) => (
                <Row key={c.slug} cam={c} failed={dead.has(c.slug)} onPick={onPick} />
              ))}
            </ul>
          </div>
        ))}
      </section>
      {UNMAPPED_CAMS.length > 0 && (
        <section className="d-sec">
          <h3 className="d-title">Belum Ada di Peta</h3>
          <ul className="cam-rows">
            {UNMAPPED_CAMS.map((c) => (
              <Row key={c.slug} cam={c} failed={dead.has(c.slug)} onPick={onPick} />
            ))}
          </ul>
        </section>
      )}
      <section className="d-sec">
        <h3 className="d-title">Arti Tanda di Peta</h3>
        <ul className="pin-legend">
          <li>
            <span className="cam-pin is-approx">
              <PinSvg />
            </span>
            Garis Putus: Posisi Perkiraan
          </li>
          <li>
            <span className="cam-pin is-mati">
              <PinSvg />
            </span>
            Abu-Abu: Gagal Diputar Tadi
          </li>
          <li>
            <span className="cam-cluster">3</span>
            Angka: Beberapa Kamera Berdekatan
          </li>
        </ul>
        <p className="d-note">
          {CCTV_CREDIT}. Siaran video memakai kuota sekitar {CCTV_MB_PER_MIN} MB per menit.
        </p>
      </section>
    </>
  );
}
