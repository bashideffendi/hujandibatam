"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { IconChevronDown, IconChevronUp } from "./icons";

type Props = {
  label: string;
  mode: string;
  collapsed: boolean;
  /** bagian Detail terbuka — hanya berpengaruh di layar sempit (≤700px), lihat globals.css */
  detail: boolean;
  inert: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onCollapse: (collapsed: boolean) => void;
  /** isi bilah mini saat panel dilipat */
  miniDot: string;
  miniMain: ReactNode;
  miniSub: string;
  /** teks untuk pembaca layar (aria-live) — berubah saat status berubah */
  liveText: string;
  children: ReactNode;
};

// Kerangka panel bawah (bottom-sheet): pegangan lipat ↔ bilah mini, plus isi panel.
// Tombol pegangan & bilah mini saling menggantikan di DOM, jadi fokus dipindahkan ke
// penggantinya supaya pengguna keyboard tidak "jatuh" ke body.
export default function Panel({
  label,
  mode,
  collapsed,
  detail,
  inert,
  panelRef,
  onCollapse,
  miniDot,
  miniMain,
  miniSub,
  liveText,
  children,
}: Props) {
  const handleRef = useRef<HTMLButtonElement>(null);
  const miniRef = useRef<HTMLButtonElement>(null);
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) return;
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
      data-mode={mode}
      inert={inert}
    >
      {collapsed ? (
        <button
          ref={miniRef}
          className="panel-mini"
          onClick={() => toggle(false)}
          aria-label="Buka panel"
          aria-expanded={false}
          aria-controls="panel-body"
        >
          <span className="mini-dot" style={{ background: miniDot }} />
          <span className="mini-time">{miniMain}</span>
          <span className="mini-view">{miniSub}</span>
          <IconChevronUp className="mini-chevron" />
        </button>
      ) : (
        <>
          <button
            ref={handleRef}
            className="panel-handle"
            onClick={() => toggle(true)}
            aria-label="Sembunyikan panel"
            aria-expanded={true}
            aria-controls="panel-body"
          >
            <IconChevronDown className="handle-chevron" />
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
