"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { EchoLevel } from "@/lib/status";
import { IconChevronUp } from "./icons";

type Props = {
  label: string;
  mode: string;
  collapsed: boolean;
  /** bagian Detail/Daftar terbuka */
  detail: boolean;
  /** daftar kelompok kamera sedang menggantikan isi panel */
  listing: boolean;
  inert: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onCollapse: (collapsed: boolean) => void;
  /** isi bilah mini saat panel dilipat: satu teks + titik kelas hujan (kalau ada) */
  miniMain: string;
  miniDot: EchoLevel | null;
  /** teks untuk pembaca layar (aria-live) — berubah hanya saat keadaan terbaru berubah */
  liveText: string;
  children: ReactNode;
};

// Kerangka panel bawah (bottom-sheet): pegangan 36×4 (area sentuh 44) ↔ bilah mini 56 px,
// plus isi panel. Pegangan & bilah mini saling menggantikan di DOM, jadi fokus dipindahkan
// ke penggantinya supaya pengguna keyboard tidak "jatuh" ke body.
export default function Panel({
  label,
  mode,
  collapsed,
  detail,
  listing,
  inert,
  panelRef,
  onCollapse,
  miniMain,
  miniDot,
  liveText,
  children,
}: Props) {
  const handleRef = useRef<HTMLButtonElement>(null);
  const miniRef = useRef<HTMLButtonElement>(null);
  const touched = useRef(false);

  // Fokus dipindah HANYA kalau perubahan datang dari pegangan/bilah mini (toggle), bukan
  // saat panel dibuka program (mis. gelembung CCTV diketuk → fokus harus di judul daftar).
  useEffect(() => {
    if (!touched.current) return;
    touched.current = false;
    (collapsed ? miniRef.current : handleRef.current)?.focus();
  }, [collapsed]);

  const toggle = (v: boolean) => {
    touched.current = true;
    onCollapse(v);
  };

  return (
    <section
      className="panel"
      aria-label={label}
      ref={panelRef}
      data-collapsed={collapsed}
      data-detail={detail}
      data-listing={listing}
      data-mode={mode}
      inert={inert}
    >
      {collapsed ? (
        <button
          ref={miniRef}
          className="panel-mini"
          onClick={() => toggle(false)}
          aria-label={`Buka Panel: ${miniMain}`}
          aria-expanded={false}
          aria-controls="panel-body"
        >
          {miniDot && <span className="answer-dot" data-level={miniDot} aria-hidden />}
          <span className="mini-main">{miniMain}</span>
          <IconChevronUp className="mini-chevron" />
        </button>
      ) : (
        <>
          <button
            ref={handleRef}
            className="panel-handle"
            onClick={() => toggle(true)}
            aria-label="Ciutkan Panel"
            aria-expanded={true}
            aria-controls="panel-body"
          >
            <i className="handle-bar" aria-hidden />
          </button>
          <div id="panel-body" className="panel-body">
            {children}
          </div>
        </>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {liveText}
      </div>
    </section>
  );
}
