export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  pickObchodakForNewLead,
  assignLeadToUser,
} from "@/lib/lead-assignment";

/**
 * POST /api/admin/redistribute-leads
 *
 * Rozdelí VŠETKY unassigned aktívne leady medzi aktívnych obchodákov
 * (round-robin least-loaded). User 2026-07-14: „nove leady co chodia nech
 * su automaticky pridelovane aktivnym" — a rovno aj tie existujúce nechajme
 * medzi aktívnych rozhodiť namiesto toho aby ležali s assigned_to=NULL.
 *
 * Response: { ok, assigned: number, skipped_no_agent: number, errors: [] }
 */
export async function POST() {
  const user = await getCurrentAppUser();
  if (!user)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();

  // Aktívne unassigned leady — status NOT IN won/lost/archived + assigned_to IS NULL
  const { data: unassigned, error: qErr } = await admin
    .from("leads")
    .select("id, name, status, created_at")
    .is("assigned_to", null)
    .not("status", "in", "(won,lost,archived)")
    .order("created_at", { ascending: true });

  if (qErr) {
    return NextResponse.json(
      { ok: false, error: qErr.message },
      { status: 500 },
    );
  }
  if (!unassigned || unassigned.length === 0) {
    return NextResponse.json({
      ok: true,
      assigned: 0,
      skipped_no_agent: 0,
      total_unassigned: 0,
      message: "Žiadne unassigned leady na rozdistribuovanie.",
    });
  }

  let assigned = 0;
  let skippedNoAgent = 0;
  const errors: Array<{ lead_id: string; error: string }> = [];

  for (const lead of unassigned) {
    const userId = await pickObchodakForNewLead(admin);
    if (!userId) {
      skippedNoAgent++;
      continue;
    }
    const res = await assignLeadToUser(admin, lead.id, userId);
    if (res.ok) {
      assigned++;
    } else {
      errors.push({ lead_id: lead.id, error: res.error ?? "unknown" });
    }
  }

  return NextResponse.json({
    ok: true,
    total_unassigned: unassigned.length,
    assigned,
    skipped_no_agent: skippedNoAgent,
    errors,
  });
}
