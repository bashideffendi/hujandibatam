"use client";

import type { RefObject } from "react";
import type { ThemeMode } from "@/lib/radar";
import { IconDrop, IconInstall, IconMoon, IconShare, IconSun } from "./icons";

type Props = {
  sub: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onShare: () => void;
  canInstall: boolean;
  onInstall: () => void;
  topbarRef: RefObject<HTMLElement | null>;
  inert: boolean;
};

// Bilah atas: wordmark (+ subjudul di layar ≥701 px) + Bagikan + tema (+ Pasang kalau
// browser menawarkan). Status data tidak di sini — keadaan terlambat/terputus jadi
// kalimat utama di panel, jadi tidak ada pil status yang bisa salah dibaca.
export default function Topbar({ sub, theme, onToggleTheme, onShare, canInstall, onInstall, topbarRef, inert }: Props) {
  return (
    <header className="topbar" ref={topbarRef} inert={inert}>
      <div className="brand">
        <span className="mark">
          <IconDrop />
        </span>
        <div className="brand-txt">
          <h1 className="name">
            Hujan <i>di</i> Batam
          </h1>
          <div className="sub">{sub}</div>
        </div>
      </div>
      <div className="topbar-right">
        {canInstall && (
          <button className="install-btn" onClick={onInstall} aria-label="Pasang Aplikasi ke Layar Utama">
            <IconInstall />
            <span className="txt">Pasang</span>
          </button>
        )}
        <button className="icon-btn" onClick={onShare} aria-label="Bagikan Tampilan Ini">
          <IconShare />
        </button>
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Ganti ke Tema Terang" : "Ganti ke Tema Gelap"}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </header>
  );
}
