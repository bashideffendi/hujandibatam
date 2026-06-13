// Kondisi tambahan dari NEA Singapura (CORS bebas, server-side digabung + cache):
//  - Kualitas udara: PSI 24-jam + PM2.5 1-jam region SOUTH (proxy haze Batam —
//    asap Sumatra/Riau itu plume yang sama yang kena SG selatan & Batam).
//  - Angin: kecepatan + arah dari stasiun Semakau (S102, paling selatan, di selat
//    menghadap Batam) — sinyal advection: ke mana sel hujan bergerak.
export const revalidate = 300;

type Aq = { psi: number; pm25: number | null; label: string; color: string };
type Wind = { speed: number; deg: number; label: string; station?: string };

const PSI_URL = "https://api.data.gov.sg/v1/environment/psi";
const WIND_SPEED_URL = "https://api-open.data.gov.sg/v2/real-time/api/wind-speed";
const WIND_DIR_URL = "https://api-open.data.gov.sg/v2/real-time/api/wind-direction";
const STATION = "S102"; // Semakau

const COMPASS = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"]; // 8 arah mata angin
function compass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

function band(psi: number): { label: string; color: string } {
  if (psi <= 50) return { label: "Baik", color: "#1aa06a" };
  if (psi <= 100) return { label: "Sedang", color: "#d99a2b" };
  if (psi <= 200) return { label: "Tidak Sehat", color: "#e2683c" };
  if (psi <= 300) return { label: "Sangat Tidak Sehat", color: "#dc3545" };
  return { label: "Berbahaya", color: "#8a1a4a" };
}

async function getAq(): Promise<Aq | null> {
  try {
    const res = await fetch(PSI_URL, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.items?.[0]?.readings;
    const psi = r?.psi_twenty_four_hourly?.south;
    if (typeof psi !== "number") return null;
    const pm25 = r?.pm25_one_hourly?.south;
    return { psi, pm25: typeof pm25 === "number" ? pm25 : null, ...band(psi) };
  } catch {
    return null;
  }
}

// Ambil 1 nilai dari format v2 real-time NEA, pilih stasiun S102 (atau paling selatan).
async function pickStation(
  url: string,
): Promise<{ value: number | null; name?: string }> {
  try {
    const res = await fetch(url, { next: { revalidate: 180 } });
    if (!res.ok) return { value: null };
    const j = await res.json();
    const d = j?.data ?? {};
    const stations: Array<{ id: string; name?: string; location?: { latitude?: number } }> =
      d.stations ?? [];
    const data: Array<{ stationId: string; value: number }> = d.readings?.[0]?.data ?? [];
    let st = stations.find((s) => s.id === STATION);
    if (!st && stations.length) {
      st = [...stations].sort(
        (a, b) => (a.location?.latitude ?? 99) - (b.location?.latitude ?? 99),
      )[0];
    }
    const v = data.find((x) => x.stationId === st?.id)?.value;
    return { value: typeof v === "number" ? v : null, name: st?.name };
  } catch {
    return { value: null };
  }
}

async function getWind(): Promise<Wind | null> {
  const [sp, di] = await Promise.all([pickStation(WIND_SPEED_URL), pickStation(WIND_DIR_URL)]);
  if (sp.value === null || di.value === null) return null;
  return {
    speed: Math.round(sp.value),
    deg: Math.round(di.value),
    label: compass(di.value),
    station: sp.name ?? di.name,
  };
}

export async function GET() {
  const [aq, wind] = await Promise.all([getAq(), getWind()]);
  return Response.json(
    { aq, wind },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
