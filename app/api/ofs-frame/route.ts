// Frame field gelombang OFS BMKG (WAVEWATCH III hi-res "w3g_hires", param swh).
// force-dynamic + no-store: baserun & nowIndex tergantung "sekarang".
//
// RESILIENSI: modelrun BMKG (peta-maritim, Cloudflare) suka MEMBLOKIR fetch server-side.
// Strategi berlapis:
//  1) coba modelrun (paling fresh & akurat kalau gak keblok);
//  2) kalau gagal → PROBE tile langsung buat nemu run TERBARU yg tile-nya beneran ADA
//     (mundur 12 jam kalau run terbaru belum terbit) — tile lebih longgar dari modelrun;
//  3) kalau probe juga keblok → slot buta 00/12 UTC ≥15h lalu (last resort).
// Hasil probe di-cache 10 mnt (module-level) biar gak hajar BMKG tiap request.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const HOST = "https://peta-maritim.bmkg.go.id";
const STEP_H = 3;
const HORIZON_H = 72;
const SAFE_LAG_H = 15;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "*/*",
  Referer: "https://peta-maritim.bmkg.go.id/ofs",
};

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(
    d.getUTCMinutes(),
  )}`;
}

// Slot run 00/12 UTC terdekat <= ms.
function slotFloor(ms: number): Date {
  const d = new Date(ms);
  const slot = d.getUTCHours() >= 12 ? 12 : 0;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), slot, 0, 0));
}

// Cek run punya tile? (1 tile Batam z7/100/64 valid=base+6h; Batam pasti punya data laut)
async function runHasTiles(base: Date): Promise<boolean> {
  const valid = fmt(new Date(base.getTime() + 6 * 3600 * 1000));
  const url = `${HOST}/api21/mpl_req/w3g_hires/swh/0/${fmt(base)}/${valid}/7/100/64.png?ci=1&overlays=,contourf&conc=snow`;
  try {
    const r = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
      headers: BROWSER_HEADERS,
    });
    return r.ok && (r.headers.get("content-type") ?? "").includes("image");
  } catch {
    return false;
  }
}

let fbCache: { base: Date; at: number } | null = null;
async function resolveFallback(): Promise<Date> {
  if (fbCache && Date.now() - fbCache.at < 10 * 60 * 1000) return fbCache.base;
  const now = Date.now();
  let found: Date | null = null;
  // kandidat run TERBARU dulu: slot ~4h, ~16h, ~28h lalu (3 slot 12-jaman terbaru)
  for (let i = 0; i < 3; i++) {
    const cand = slotFloor(now - (4 + i * 12) * 3600 * 1000);
    if (await runHasTiles(cand)) {
      found = cand;
      break;
    }
  }
  // probe pun keblok → slot buta ≥15h (tile-nya biasanya tetap kemuat di browser)
  const base = found ?? slotFloor(now - SAFE_LAG_H * 3600 * 1000);
  fbCache = { base, at: Date.now() };
  return base;
}

export async function GET() {
  let base: Date | null = null;
  try {
    const res = await fetch(`${HOST}/api21/modelrun`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      headers: BROWSER_HEADERS,
    });
    const j = await res.json();
    const baseIso: string | undefined = j?.w3g_hires?.[0];
    if (baseIso) {
      const d = new Date(baseIso);
      if (!Number.isNaN(d.getTime())) base = d;
    }
  } catch {
    /* modelrun keblok/hang → fallback berlapis */
  }

  const fromModelrun = !!base;
  if (!base) base = await resolveFallback();

  const baserun = fmt(base);
  const now = Date.now();
  const frames: { valid: string; t: number }[] = [];
  for (let h = 0; h <= HORIZON_H; h += STEP_H) {
    const d = new Date(base.getTime() + h * 3600 * 1000);
    frames.push({ valid: fmt(d), t: d.getTime() });
  }
  let nowIndex = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i].t <= now) nowIndex = i;

  // umur run (jam) → client kasih tanda kalau datanya agak lama
  const ageH = Math.round((now - base.getTime()) / 3600000);

  return Response.json(
    { baserun, frames: frames.map((f) => f.valid), nowIndex, fallback: !fromModelrun, ageH },
    { headers: { "Cache-Control": "no-store" } },
  );
}
