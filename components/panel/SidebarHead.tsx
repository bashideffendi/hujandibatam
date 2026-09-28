import type { ThemeMode } from "@/lib/radar";
import { IconDrop, IconInstall, IconMoon, IconShare, IconSun } from "../icons";

type Props = {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onShare: () => void;
  canInstall: boolean;
  onInstall: () => void;
};

// Kepala sidebar laptop: wordmark + Bagikan + tema (+ Pasang). Di HP disembunyikan CSS —
// di sana bilah atas (Topbar) yang memegang peran ini.
export default function SidebarHead({ theme, onToggleTheme, onShare, canInstall, onInstall }: Props) {
  return (
    <div className="sb-head">
      {/* h1 di sini hanya tampil di laptop; di HP h1 ada di Topbar (yang ini display:none) */}
      <h1 className="sb-brand">
        <IconDrop className="sb-drop" />
        Hujan <i>di</i> Batam
      </h1>
      <div className="sb-icons">
        {canInstall && (
          <button className="sb-ib" onClick={onInstall} aria-label="Pasang Aplikasi ke Layar Utama">
            <IconInstall />
          </button>
        )}
        <button className="sb-ib" onClick={onShare} aria-label="Bagikan Tampilan Ini">
          <IconShare />
        </button>
        <button
          className="sb-ib"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Ganti ke Tema Terang" : "Ganti ke Tema Gelap"}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </div>
  );
}
