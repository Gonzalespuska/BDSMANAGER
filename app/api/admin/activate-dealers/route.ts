export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/activate-dealers
 *
 * Aktivuje Denis Petrus + Alena Schronk ako obchodákov (role='obchod',
 * active=true). Match cez meno (case-insensitive) alebo email.
 *
 * User 2026-07-14: „urob z Denis Petrus a Alena Schronk normalnych
 * obchodakov idu uz volat".
 *
 * Response: { ok, matched: [{name, before, after}], not_found: [] }
 */

const TARGETS = [
  { pattern: "denis petrus", label: "Denis Petrus" },
  { pattern: "alena schronk", label: "Alena Schronk" },
];

export async function POST() {
  const user = await getCurrentAppUser();
  if (!user)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();

  const matched: Array<{
    name: string;
    id: string;
    before: { role: string; active: boolean };
    after: { role: string; active: boolean };
  }> = [];
  const notFound: string[] = [];

  for (const t of TARGETS) {
    // Fuzzy match — case-insensitive name contains obe words.
    const { data } = await admin
      .from("users")
      .select("id, name, email, role, active")
      .ilike("name", `%${t.pattern.split(" ")[0]}%`);

    const found = (data ?? []).find((u) => {
      const n = ((u as { name: string | null }).name ?? "").toLowerCase();
      return t.pattern
        .split(" ")
        .every((w) => n.includes(w));
    });

    if (!found) {
      notFound.push(t.label);
      continue;
    }

    const before = {
      role: (found as { role: string }).role,
      active: (found as { active: boolean }).active,
    };

    const { error } = await admin
      .from("users")
      .update({
        role: "obchod",
        active: true,
        capacity: 5,
      })
      .eq("id", (found as { id: string }).id);

    if (error) {
      notFound.push(`${t.label} (update error: ${error.message})`);
      continue;
    }

    matched.push({
      name: t.label,
      id: (found as { id: string }).id,
      before,
      after: { role: "obchod", active: true },
    });
  }

  return NextResponse.json({
    ok: true,
    matched,
    not_found: notFound,
  });
}
