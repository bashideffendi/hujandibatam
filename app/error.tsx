"use client";

// Error boundary segmen: kalau peta/klien lempar error (plugin Leaflet, JSON sumber yang
// berubah, dsb.), tampilkan layar santai berbahasa Indonesia + tombol coba lagi —
// bukan "Application error" bawaan Next yang berbahasa Inggris dan tanpa aksi.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="err-screen" role="alert">
      <div className="err-card">
        <div className="err-title">Petanya lagi ngambek</div>
        <p className="err-body">
          Ada yang nyangkut pas nampilin peta. Biasanya cukup dicoba lagi. Kalau masih bandel,
          muat ulang halamannya.
        </p>
        <div className="err-actions">
          <button className="err-btn primary" onClick={() => reset()}>
            Coba lagi
          </button>
          <button className="err-btn" onClick={() => window.location.reload()}>
            Muat ulang
          </button>
        </div>
        {error?.digest && <div className="err-digest">kode: {error.digest}</div>}
      </div>
    </main>
  );
}
