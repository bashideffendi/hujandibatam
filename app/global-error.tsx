"use client";

// Boundary paling luar (layout ikut gagal) — wajib render <html>/<body> sendiri.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, background: "#0c0d10", color: "#f2f3f5", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }} role="alert">
          <div style={{ maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Hujan di Batam lagi ngambek</div>
            <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.75, margin: "0 0 16px" }}>
              Ada yang nyangkut. Coba muat ulang halamannya.
            </p>
            <button
              onClick={() => reset()}
              style={{
                font: "inherit",
                fontWeight: 600,
                padding: "10px 18px",
                borderRadius: 999,
                border: 0,
                background: "#6ea2dd",
                color: "#0c1018",
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              Coba lagi
            </button>
            {error?.digest && <div style={{ fontSize: 11, opacity: 0.5, marginTop: 12 }}>kode: {error.digest}</div>}
          </div>
        </main>
      </body>
    </html>
  );
}
