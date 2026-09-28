import type { Answer as AnswerT } from "@/lib/status";
import { IconWarn } from "../icons";

type Props = {
  a: Pick<AnswerT, "headline" | "tone" | "dot" | "context">;
  /** baris kecil di atas jawaban (sumber & jam) — hanya tampil di sidebar laptop */
  eyebrow?: string;
  /** titik "langsung" di eyebrow (data terbaru segar) */
  live?: boolean;
  /** tawarkan "Coba Lagi" di ujung baris konteks */
  onRetry?: () => void;
};

/**
 * Puncak panel: SATU jawaban (teks terbesar) + satu baris konteks. Semua penjelasan
 * lain ada di Detail. Titik di depan jawaban = warna kelas hujan dari palet MSS.
 */
export function Answer({ a, onRetry, eyebrow, live }: Props) {
  return (
    <div className="answer-block">
      {eyebrow && (
        <p className="eyebrow">
          {live && <span className="live-dot" aria-hidden />}
          {eyebrow}
        </p>
      )}
      <h2 className="answer" data-tone={a.tone} tabIndex={-1}>
        {a.dot && <span className="answer-dot" data-level={a.dot} aria-hidden />}
        <span>{a.headline}</span>
      </h2>
      {(a.context || onRetry) && (
        <p className="context">
          {a.context}
          {onRetry && (
            <button
              className="link-btn retry-btn"
              onClick={(e) => {
                // tombol hilang begitu muat ulang berhasil → pindahkan fokus ke jawaban dulu
                e.currentTarget.closest(".answer-block")?.querySelector<HTMLElement>(".answer")?.focus();
                onRetry();
              }}
            >
              Coba Lagi
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Baris peringatan (BMKG) atau masalah data — ikon segitiga + teks warna peringatan.
 * `chip` = peringatan dini BMKG, tampil sebagai label berlatar di atas jawaban.
 */
export function WarnRow({ text, chip = false }: { text: string; chip?: boolean }) {
  return (
    <p className={chip ? "warn-row warn-chip" : "warn-row"}>
      <IconWarn className="warn-ico" />
      <span>{text}</span>
    </p>
  );
}
