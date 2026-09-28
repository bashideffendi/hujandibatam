import type { Answer as AnswerT } from "@/lib/status";
import { IconWarn } from "../icons";

type Props = {
  a: Pick<AnswerT, "headline" | "tone" | "dot" | "context">;
  /** tawarkan "Coba Lagi" di ujung baris konteks */
  onRetry?: () => void;
};

/**
 * Puncak panel: SATU jawaban (teks terbesar) + satu baris konteks. Semua penjelasan
 * lain ada di Detail. Titik di depan jawaban = warna kelas hujan dari palet MSS.
 */
export function Answer({ a, onRetry }: Props) {
  return (
    <div className="answer-block">
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

/** Baris peringatan (BMKG) atau masalah data — ikon segitiga + teks warna peringatan. */
export function WarnRow({ text }: { text: string }) {
  return (
    <p className="warn-row">
      <IconWarn className="warn-ico" />
      <span>{text}</span>
    </p>
  );
}
