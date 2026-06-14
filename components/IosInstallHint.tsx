"use client";

import { useEffect, useState } from "react";

// iOS Safari nggak punya prompt install PWA (kebijakan Apple) — install cuma lewat
// Share → Add to Home Screen. Tampilin petunjuk kecil khusus iPhone/iPad Safari
// yang belum nginstal. Dismissable + diingat di localStorage.
const KEY = "hujan-ios-hint";

export default function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") return;
    } catch {
      /* abaikan */
    }
    const ua = navigator.userAgent || "";
    const nav = navigator as Navigator & { standalone?: boolean };
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
    const standalone =
      nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    if (isIOS && isSafari && !standalone) setShow(true);
  }, []);

  if (!show) return null;

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* abaikan */
    }
  };

  return (
    <div className="ios-hint" role="note">
      <svg className="ios-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12M8.5 6.5L12 3l3.5 3.5" />
        <path d="M6 12.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6.5" />
      </svg>
      <span>
        Pasang ke iPhone: ketuk <b>Bagikan</b> lalu <b>&ldquo;Add to Home Screen&rdquo;</b>
      </span>
      <button className="ios-hint-x" onClick={close} aria-label="Tutup petunjuk">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
