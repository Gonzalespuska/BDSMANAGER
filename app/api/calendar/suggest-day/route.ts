export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/calendar/suggest-day
 *
 * Body: { city: string, mode: 'inspection' | 'realization' }
 *
 * Heuristika:
 *   Nájdi deň v najbližších 30 dňoch kde tím MÁ najviac ďalších
 *   priradení v ROVNAKOM meste (batchovanie ciest — jedna cesta,
 *   viac zákaziek).
 *   Ak žiadny match → prvý pracovný deň za 3 dni (nechať priestor
 *   klientovi + tímu naplánovať).
 *
 * Vráti:
 *   { ok: true, date: 'YYYY-MM-DD', time: 'HH:MM', reason: string,
 *     score: number, same_city_count: number }
 */

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let body: { city?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const city = (body.city ?? "").trim();
  const mode = body.mode === "inspection" ? "inspection" : "realization";
  if (!city) {
    return NextResponse.json(
      { ok: false, error: "missing_city" },
      { status: 400 },
    );
  }
  const cityNorm = normalize(city);

  const admin = createAdminClient();

  // Range: od zajtra (nedávať dnešok — obvykle nestíha) do +30 dní
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const in30d = new Date(tomorrow);
  in30d.setDate(in30d.getDate() + 30);

  // Fetch VŠETKY calendar_notes v range s lead_id (bez neho nevieme mesto)
  const { data: notes } = await admin
    .from("calendar_notes")
    .select("date, lead_id, body, starts_at")
    .gte("date", tomorrow.toISOString().slice(0, 10))
    .lte("date", in30d.toISOString().slice(0, 10))
    .not("lead_id", "is", null);

  // Fetch leady batch pre extract data.lokalita
  const leadIds = Array.from(
    new Set((notes ?? []).map((n) => n.lead_id as string)),
  );
  const leadCityMap = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads } = await admin
      .from("leads")
      .select("id, data")
      .in("id", leadIds);
    for (const l of leads ?? []) {
      const lok = (l.data as Record<string, unknown> | null)?.lokalita;
      if (typeof lok === "string" && lok.trim()) {
        leadCityMap.set(l.id as string, lok.trim());
      }
    }
  }

  // Score per date — how many jobs in SAME city on that date
  const dayScores = new Map<string, { sameCity: number; total: number }>();
  for (const n of notes ?? []) {
    const date = n.date as string;
    const leadCity = leadCityMap.get(n.lead_id as string);
    const isSame = leadCity && normalize(leadCity) === cityNorm;
    const cur = dayScores.get(date) ?? { sameCity: 0, total: 0 };
    cur.total += 1;
    if (isSame) cur.sameCity += 1;
    dayScores.set(date, cur);
  }

  // Vyhľadaj najlepší deň — max sameCity, tie-break menej total (menej preplnený)
  // Ignorujeme dni s > 4 total events (preplnené).
  let bestDate: string | null = null;
  let bestScore = 0;
  let bestSameCity = 0;
  let bestTotal = 0;
  for (const [date, score] of dayScores.entries()) {
    if (score.total > 4) continue;
    if (score.sameCity === 0) continue; // len dni ktoré aspoň jeden batch
    const dayScore = score.sameCity * 10 - score.total;
    if (dayScore > bestScore) {
      bestScore = dayScore;
      bestDate = date;
      bestSameCity = score.sameCity;
      bestTotal = score.total;
    }
  }

  // Fallback: prvý pracovný deň o 3 dni (dnes+3)
  if (!bestDate) {
    const target = new Date(now);
    target.setDate(target.getDate() + 3);
    // Skip sobota/nedeľa
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }
    bestDate = target.toISOString().slice(0, 10);
  }

  // Default time: 9:00 (rano) pre obhliadku, 8:00 pre realizáciu
  const time = mode === "inspection" ? "10:00" : "08:00";

  const reason =
    bestSameCity > 0
      ? `V ${city} má tím v ten deň ${bestSameCity === 1 ? "1 ďalšiu zákazku" : `${bestSameCity} ďalšie zákazky`} — jedna cesta, viac roboty.`
      : `Prvý voľný pracovný deň — zatiaľ žiadny batch v ${city}.`;

  return NextResponse.json({
    ok: true,
    date: bestDate,
    time,
    reason,
    score: bestScore,
    same_city_count: bestSameCity,
    same_day_total: bestTotal,
  });
}
