// Frame field gelombang OFS BMKG (WAVEWATCH III hi-res "w3g_hires", param swh =
// significant wave height), disajikan sebagai TMS tile pre-colored (contourf).
// force-dynamic + no-store: baserun & nowIndex tergantung "sekarang" (gotcha jam-beku).
//
// RESILIENSI: modelrun BMKG (peta-maritim) di belakang Cloudflare & suka MEMBLOKIR
// fetch server-side ("terindikasi serangan"). Kalau modelrun gagal/keblok/hang → JANGAN
// mati; run w3g_hires jadwalnya TETAP (00 & 12 UTC) jadi baserun bisa DIHITUNG dari jam.
// Tile ditarik BROWSER (lolos Cloudflare), jadi asal client dapet baserun, OMBAK jalan.
export const dynamic = "force-dynamic";

const HOST = "https://peta-maritim.bmkg.go.id";
const STEP_H = 3; // tile tiap 3 jam (terverifikasi: +1h 404, +3h 200)
const HORIZON_H = 72; // horizon frame
const SAFE_LAG_H = 15; // run 00/12 UTC terbit dgn jeda; ambil slot yg >= 15h lalu = pasti ada

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(
    d.getUTCMinutes(),
  )}`;
}

// Baserun cadangan TANPA fetch: slot 00/12 UTC terbaru yang >= SAFE_LAG_H jam lalu.
function fallbackBase(): Date {
  const c = new Date(Date.now() - SAFE_LAG_H * 3600 * 1000);
  const slot = c.getUTCHours() >= 12 ? 12 : 0;
  return new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), slot, 0, 0));
}

export async function GET() {
  let base: Date | null = null;
  try {
    const res = await fetch(`${HOST}/api21/modelrun`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4500), // jangan gantung kalau Cloudflare nahan
      // UA browser-normal + Referer (UA custom keliatan bot → gampang di-block).
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        Referer: "https://peta-maritim.bmkg.go.id/ofs",
      },
    });
    const j = await res.json();
    const baseIso: string | undefined = j?.w3g_hires?.[0];
    if (baseIso) {
      const d = new Date(baseIso);
      if (!Number.isNaN(d.getTime())) base = d;
    }
  } catch {
    /* modelrun keblok/hang/non-JSON → jatuh ke fallback hitungan */
  }

  const fallback = !base;
  if (!base) base = fallbackBase();

  const baserun = fmt(base);
  const now = Date.now();
  const frames: { valid: string; t: number }[] = [];
  for (let h = 0; h <= HORIZON_H; h += STEP_H) {
    const d = new Date(base.getTime() + h * 3600 * 1000);
    frames.push({ valid: fmt(d), t: d.getTime() });
  }
  // frame yang nutupin sekarang = step terakhir yang <= now
  let nowIndex = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i].t <= now) nowIndex = i;

  return Response.json(
    { baserun, frames: frames.map((f) => f.valid), nowIndex, fallback },
    { headers: { "Cache-Control": "no-store" } },
  );
}
