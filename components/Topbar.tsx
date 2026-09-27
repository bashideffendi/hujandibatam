"use client";

import type { RefObject } from "react";
import type { ThemeMode } from "@/lib/radar";
import type { Pill } from "@/lib/status";
import { IconDrop, IconInstall, IconMoon, IconShare, IconSun } from "./icons";

type Props = {
  sub: string;
  pill: Pill;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onShare: () => void;
  canInstall: boolean;
  onInstall: () => void;
  topbarRef: RefObject<HTMLElement | null>;
  inert: boolean;
};

// Bilah atas: wordmark + status singkat + Bagikan + tema (+ Pasang kalau browser menawarkan).
// Di layar sempit teks pill & tombol Pasang disembunyikan (lihat globals.css) — statusnya
// tetap tampil lengkap di panel, jadi tidak ada informasi yang hilang.
export default function Topbar({
  sub,
  pill,
  theme,
  onToggleTheme,
  onShare,
  canInstall,
  onInstall,
  topbarRef,
  inert,
}: Props) {
  return (
    <header className="topbar" ref={topbarRef} inert={inert}>
      <div className="brand">
        <span className="mark">
          <IconDrop />
        </span>
        <div>
          <h1 className="name">
            Hujan <i>di</i> Batam
          </h1>
          <div className="sub">{sub}</div>
        </div>
      </div>
      <div className="topbar-right">
        {canInstall && (
          <button className="install-btn" onClick={onInstall} aria-label="Pasang aplikasi ke layar utama">
            <IconInstall />
            <span className="txt">Pasang</span>
          </button>
        )}
        <span
          className={`live-pill${pill.kind === "muted" ? " forecast" : ""}`}
          data-stale={pill.kind === "stale" ? "" : undefined}
          role="img"
          aria-label={`Status: ${pill.text}`}
        >
          <span className="dot" />
          <span className="txt">{pill.text}</span>
        </span>
        <button className="icon-btn" onClick={onShare} aria-label="Bagikan tampilan ini">
          <IconShare />
        </button>
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </header>
  );
}
