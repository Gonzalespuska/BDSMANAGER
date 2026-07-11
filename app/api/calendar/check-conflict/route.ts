export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import skPlacesRaw from "@/lib/data/sk-places.json";

/**
 * POST /api/calendar/check-conflict
 *
 * Body: { target_user_id, date (YYYY-MM-DD), city?, m2? }
 *
 * Zisti aké eventy má realizator/obhliadkar na daný deň a vráti verdikt:
 *   • "ok"     — v pohode, ide priradiť
 *   • "warn"   — má už niečo, ale ide sa zvládnuť (2 malé garáže, blízke mestá)
 *   • "block"  — evidentne nezvládne (celodenná zákazka + druhá strana SR)
 *
 * Heuristika:
 *   - Celkové m² (existujúce + nové) > 100 A vzdialenosť medzi mestami > 100 km
 *     → BLOCK
 *   - Celkové m² > 60 A vzdialenosť > 50 km → WARN
 *   - Celkové m² > 40 A rovnaké mesto → WARN "veľa práce ale zvládne sa"
 *   - Prekrytie času (2 eventy < 4 h od seba) → WARN
 */

const SK_PLACES = skPlacesRaw as [string, number][];
const CITY_KM = new Map<string, number>();
for (const [name, km] of SK_PLACES) {
  CITY_KM.set(name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(), km);
}

function cityKm(name: string | null | undefined): number | null {
  if (!name) return null;
  const key = name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  return CITY_KM.get(key) ?? null;
}

function distanceKm(a: string | null, b: string | null): number | null {
  const ka = cityKm(a);
  const kb = cityKm(b);
  if (ka == null || kb == null) return null;
  // Approximation — obidve merajú od Ružomberka. Rozdiel je najhoršie 2×,
  // najlepšie priamy pomer.
  return Math.abs(ka - kb);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    target_user_id?: string;
    date?: string;
    city?: string | null;
    m2?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const targetId = body.target_user_id;
  const date = body.date;
  const newCity = body.city ?? null;
  const newM2 = body.m2 ? parseFloat(body.m2) : null;

  if (!targetId || !date) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Fetch existujúce eventy pre daný deň + target user (kde je on user_id
  // creator ALEBO target)
  const { data: notes } = await admin
    .from("calendar_notes")
    .select("id, body, kind, starts_at, lead_id")
    .eq("date", date)
    .or(`user_id.eq.${targetId},target_user_id.eq.${targetId}`);

  const existingLeadIds = Array.from(
    new Set((notes ?? []).map((n) => n.lead_id as string).filter(Boolean)),
  );
  const leadInfo = new Map<
    string,
    { city: string | null; m2: number | null }
  >();
  if (existingLeadIds.length > 0) {
    const { data: leads } = await admin
      .from("leads")
      .select("id, data")
      .in("id", existingLeadIds);
    for (const l of leads ?? []) {
      const d = (l.data as Record<string, unknown> | null) ?? {};
      const city = typeof d.lokalita === "string" ? d.lokalita : null;
      const rawM2 = d.plocha;
      const m2 =
        typeof rawM2 === "number"
          ? rawM2
          : typeof rawM2 === "string"
            ? parseFloat(rawM2)
            : null;
      leadInfo.set(l.id as string, { city, m2 });
    }
  }

  const existing = (notes ?? []).map((n) => {
    const info = n.lead_id ? leadInfo.get(n.lead_id as string) : null;
    return {
      id: n.id as string,
      kind: n.kind as string,
      starts_at: n.starts_at as string | null,
      city: info?.city ?? null,
      m2: info?.m2 ?? null,
      distance_from_new_km:
        info?.city && newCity ? distanceKm(info.city, newCity) : null,
    };
  });

  // Celkové m² na deň (existujúce + nové)
  const existingM2Sum = existing.reduce((s, e) => s + (e.m2 ?? 0), 0);
  const totalM2 = existingM2Sum + (newM2 ?? 0);

  // Max vzdialenosť medzi ktoroukoľvek existujúcou zákazkou a novou
  const maxDistance = existing.reduce((max, e) => {
    const d = e.distance_from_new_km;
    return d != null && d > max ? d : max;
  }, 0);

  let verdict: "ok" | "warn" | "block" = "ok";
  const reasons: string[] = [];

  if (existing.length === 0) {
    verdict = "ok";
  } else {
    // BLOCK — celodenná zákazka + druhá strana SR
    if (totalM2 > 100 && maxDistance > 100) {
      verdict = "block";
      reasons.push(
        `Celkom ${totalM2.toFixed(0)} m² na jeden deň + vzdialenosť ${maxDistance.toFixed(0)} km — fyzicky sa nedá stihnúť.`,
      );
    } else if (totalM2 > 60 && maxDistance > 50) {
      verdict = "warn";
      reasons.push(
        `Celkom ${totalM2.toFixed(0)} m² + cesta ${maxDistance.toFixed(0)} km medzi zákazkami. Overiť s tímom či to zvládnu.`,
      );
    } else if (totalM2 > 40) {
      verdict = "warn";
      reasons.push(
        `Za jeden deň má tento tím už ${existingM2Sum.toFixed(0)} m² zákaziek + tvoja ${newM2?.toFixed(0) ?? "?"} m² — hutný deň.`,
      );
    } else {
      verdict = "warn";
      reasons.push(
        `Tento tím už má ${existing.length} zákazk${existing.length === 1 ? "u" : "y"} v ten deň — over voľnosť.`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    verdict,
    reasons,
    existing_count: existing.length,
    existing_m2_sum: existingM2Sum,
    new_m2: newM2,
    total_m2: totalM2,
    max_distance_km: existing.length > 0 ? maxDistance : 0,
    existing,
  });
}
