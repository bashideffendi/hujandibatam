// Prakiraan resmi BMKG untuk "Perairan Kep. Batam" (P.R.02, Stamet Hang Nadim): kategori &
// tinggi gelombang per jam, angin/hembusan, arus, cuaca — plus PERINGATAN DINI gelombang yang
// menyebut perairan Batam. Data persis Batam (bukan proksi), pelengkap field warna OFS.
// Penguraian & pemilihan jam yang berlaku ada di lib/perairan.ts.
//
// WAF BMKG menolak User-Agent "Mozilla/5.0" polos tapi menerima UA browser lengkap.
import type { PerairanResponse, PerairanWarn } from "@/lib/api-types";
import { emptyPerairan, parseBulletin, pickPerairan, warnAt } from "@/lib/perairan";
import { OFS_PERAIRAN, OFS_REFERER, OFS_WARNINGS } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: OFS_REFERER,
};
// Latensi BMKG terukur 0,7–3,6 dtk → 8 dtk (4 dtk pernah bikin 503 di panggilan pertama).
const FETCH_TIMEOUT_MS = 8000;
// Berkas terbit ±sekali sehari (issued 12.00 UTC, Last-Modified ±00.00 UTC) dan mencakup
// 3 hari; data mentah terakhir tetap jujur selama jamnya dipilih ulang tiap request.
const LAST_GOOD_MAX_MS = 36 * 3600 * 1000;
// Aman di-cache: respons membawa slot 48 jam ke depan dan klien memilih jamnya sendiri.
const OK_HEADERS = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" };
// Peringatan gagal dimuat → status "unknown"; jangan dikunci lama di CDN.
const WARN_UNKNOWN_HEADERS = { "Cache-Control": "public, s-maxage=60" };

type Raw = Record<string, unknown>;
let lastGood: { raw: Raw; at: number } | null = null;
// Buletin peringatan yang pernah terlihat (per instance). BMKG MENIMPA warnings.json ±19.00 WIB
// dengan buletin yang baru berlaku 07.00 WIB esoknya → buletin yang berlaku malam itu hanya
// ada kalau instance ini sempat melihatnya. Dibuang begitu masa berlakunya habis.
let bulletins: PerairanWarn[] = [];
let warnFetchedAt = 0;
const WARN_FRESH_MS = 24 * 3600e3; // lebih lama tak berhasil ambil → buletin pengganti bisa terlewat

async function getJson(url: string): Promise<Raw> {
  const res = await fetch(url, {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: HEADERS,
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as Raw;
}

export async function GET() {
  const [p, w] = await Promise.allSettled([getJson(OFS_PERAIRAN), getJson(OFS_WARNINGS)]);
  const now = Date.now();
  // Peringatan: simpan buletin baru; gagal/skema berubah → tetap pakai yang masih berlaku.
  if (w.status === "fulfilled") {
    const b = parseBulletin(w.value);
    if (b) {
      warnFetchedAt = now;
      bulletins = [...bulletins.filter((x) => !(x.from === b.from && x.until === b.until)), b]
        .filter((x) => Date.parse(x.until) > now)
        .slice(-4);
    } else console.warn('[perairan] peringatan: skema berubah (key "Kep. Riau".data.warning tidak dikenali)');
  } else console.warn("[perairan] peringatan gagal:", (w.reason as Error)?.message);
  const known = now - warnFetchedAt < WARN_FRESH_MS ? bulletins : [];

  if (p.status === "fulfilled" && Array.isArray(p.value.forecast_day1)) {
    lastGood = { raw: p.value, at: now };
    const body = pickPerairan(p.value, known, now) satisfies PerairanResponse;
    const ok = warnAt(body.warns, now).current.status === "ok";
    return Response.json(body, { headers: ok ? OK_HEADERS : WARN_UNKNOWN_HEADERS });
  }
  console.warn(
    "[perairan] prakiraan gagal:",
    p.status === "rejected" ? (p.reason as Error)?.message : "schema: forecast_day1 bukan array",
  );
  if (lastGood && now - lastGood.at < LAST_GOOD_MAX_MS) {
    return Response.json(pickPerairan(lastGood.raw, known, now), { headers: { "Cache-Control": "public, s-maxage=120" } });
  }
  return Response.json(emptyPerairan(), { status: 503, headers: { "Cache-Control": "no-store" } });
}
