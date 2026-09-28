"use client";

import { useEffect, useRef } from "react";
import type { Cam } from "@/lib/cctv";
import { IconChevronRight, IconClose } from "../icons";

type Props = {
  members: Cam[];
  dead: ReadonlyMap<string, number | null>;
  onPick: (cam: Cam) => void;
  onZoom: () => void;
  onClose: () => void;
};

/** Sub-baris kamera: kenapa perlu diperhatikan dulu, baru wilayahnya. */
export const camSub = (cam: Cam, failed: boolean) =>
  failed ? "Gagal Diputar Tadi" : cam.approx ? "Posisi Perkiraan" : cam.area;

// Daftar kamera satu kelompok (gelembung angka yang diketuk), menggantikan isi panel di
// antara pegangan dan footer. Fokus pindah ke judul saat muncul; × atau Esc menutup
// (fokus dikembalikan ke gelembung oleh RadarMap/CctvLayer).
export default function CamList({ members, dead, onPick, onZoom, onClose }: Props) {
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="cam-list"
      role="region"
      aria-labelledby="cam-list-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="cam-list-head">
        <h2 className="cam-list-title" id="cam-list-title" ref={headRef} tabIndex={-1}>
          {members.length} Kamera di Sini
        </h2>
        <button className="x-btn" onClick={onClose} aria-label="Tutup Daftar Kamera">
          <IconClose />
        </button>
      </div>
      <ul className="cam-rows">
        {members.map((cam) => {
          const failed = dead.has(cam.slug);
          return (
            <li key={cam.slug}>
              <button className="cam-row" data-failed={failed || undefined} onClick={() => onPick(cam)}>
                <span className="cam-row-txt">
                  <span className="nm">{cam.name}</span>
                  <span className="sub">{camSub(cam, failed)}</span>
                </span>
                <IconChevronRight className="cam-row-chev" />
              </button>
            </li>
          );
        })}
      </ul>
      <button className="link-btn cam-zoom" onClick={onZoom}>
        Perbesar Peta ke Sini
      </button>
    </div>
  );
}
