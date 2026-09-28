"use client";

// Error boundary segmen: kalau peta/klien lempar error (plugin Leaflet, JSON sumber yang
// berubah, dsb.), tampilkan layar berbahasa Indonesia + tombol Coba Lagi —
// bukan "Application error" bawaan Next yang berbahasa Inggris dan tanpa aksi.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="err-screen" role="alert">
      <div className="err-card">
        <div className="err-title">Peta Belum Bisa Ditampilkan</div>
        <p className="err-body">
          Ada kendala saat menampilkan peta. Biasanya cukup dicoba lagi. Kalau masih muncul,
          muat ulang halamannya.
        </p>
        <div className="err-actions">
          <button className="err-btn primary" onClick={() => reset()}>
            Coba Lagi
          </button>
          <button className="err-btn" onClick={() => window.location.reload()}>
            Muat Ulang
          </button>
        </div>
        {error?.digest && <div className="err-digest">Kode: {error.digest}</div>}
      </div>
    </main>
  );
}
