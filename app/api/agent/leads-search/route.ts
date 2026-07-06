export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * GET /api/agent/leads-search?q=<query>&kind=inspection|realization
 *
 * Autocomplete leadov pre "+ Nová obhliadka / realizácia" modal v kalendári.
 * Vráti top 15 relevantných leadov (obchod filter podľa assigned_to, admin
 * vidí všetky).
 *
 * Vhodné stavy:
 *   - inspection: leady kde je zmyslupné poslať na obhliadku
 *     (phone_revealed, interested, no_answer, quote_sent, needs_inspection)
 *   - realization: leady s uzatvorenou dohodou / obhliadnuté
 *     (won, quote_sent, inspected, interested)
 */
export async function GET(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const kind = url.searchParams.get("kind") ?? "inspection";

  const sb = createAdminClient();

  // Stavy podľa typu úlohy
  const statuses =
    kind === "realization"
      ? ["won", "quote_sent", "inspected", "interested", "needs_inspection"]
      : [
          "phone_revealed",
          "interested",
          "no_answer",
          "quote_sent",
          "needs_inspection",
          "new",
        ];

  let query = sb
    .from("leads")
    .select("id, name, phone, email, status, data, created_at")
    .in("status", statuses)
    .order("last_activity_at", { ascending: false })
    .limit(15);

  if (user.role !== "admin") {
    query = query.eq("assigned_to", user.id);
  }

  // Voliteľný search q — po mene / telefóne / email
  if (q.length >= 2) {
    const safe = q.replace(/[\\%_,]/g, (m) => "\\" + m);
    const digitsOnly = q.replace(/[^0-9]/g, "");
    const like = `*${safe}*`;
    const clauses = [`name.ilike.${like}`, `email.ilike.${like}`];
    if (digitsOnly.length >= 3) {
      const variants: string[] = [digitsOnly];
      if (digitsOnly.startsWith("0")) {
        variants.push("421" + digitsOnly.slice(1));
      }
      for (const v of variants) {
        clauses.push(`phone_digits.ilike.*${v}*`);
      }
      clauses.push(`phone.ilike.${like}`);
    }
    query = query.or(clauses.join(","));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const leads = (data ?? []).map((l) => {
    const d = (l.data as Record<string, unknown>) ?? {};
    return {
      id: l.id as string,
      name: (l.name as string) ?? "",
      phone: (l.phone as string | null) ?? null,
      email: (l.email as string | null) ?? null,
      status: l.status as string,
      city: (d.lokalita as string | null) ?? null,
      m2: (d.plocha as string | null) ?? null,
      floor_type: (d.typ_podlahy as string | null) ?? null,
    };
  });

  return NextResponse.json({ ok: true, leads });
}
