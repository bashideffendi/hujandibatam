"use client";

import { useEffect } from "react";

// Daftarin service worker minimal (lihat public/sw.js) supaya app installable
// sebagai PWA di Chrome Android (butuh SW dengan fetch handler).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* abaikan — install opsional */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);
  return null;
}
