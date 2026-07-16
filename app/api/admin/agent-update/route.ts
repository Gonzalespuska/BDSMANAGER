export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/agent-update
 *
 * Náhrada za `updateAgentAction` server action. Na CF Pages sú server
 * actions občas nespoľahlivé — REST API endpoint funguje 100%.
 *
 * User 2026-07-16 15x: „posielam ti ze to nejde mozes to urobit inak a
 * finalne aby to slo". Fix: nahradiť server action REST endpointom.
 *
 * Body: {
 *   id: string,
 *   name?: string,
 *   phone?: string | null,
 *   role?: string,
 *   secondary_roles?: string[],
 *   payout_percent?: number,
 *   home_city?: string | null,
 * }
 * Response: { ok: true } alebo { ok: false, error }
 */
const ROLES = ["admin", "obchod", "obhliadky", "realizacie", "office", "skolenie"] as const;

export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentAppUser();
    if (!me) {
      return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
    }
    if (me.role !== "admin") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    let body: {
      id?: string;
      /** Špeciálne akcie — deactivate/activate/delete. Ak set, ignoruj ostatné fields. */
      action?: "deactivate" | "activate" | "delete";
      name?: string;
      phone?: string | null;
      role?: string;
      secondary_roles?: string[];
      payout_percent?: number;
      home_city?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    if (!body.id) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ── Special actions: deactivate / activate / delete ──────────────────
    if (body.action) {
      if (body.id === me.id && (body.action === "deactivate" || body.action === "delete")) {
        return NextResponse.json(
          { ok: false, error: "Nemôžeš sám seba deaktivovať / zmazať." },
          { status: 400 },
        );
      }
      if (body.action === "deactivate") {
        const { error } = await admin
          .from("users")
          .update({ active: false, capacity: 0 })
          .eq("id", body.id);
        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, action: "deactivate" });
      }
      if (body.action === "activate") {
        const { error } = await admin
          .from("users")
          .update({ active: true, capacity: 5 })
          .eq("id", body.id);
        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, action: "activate" });
      }
      if (body.action === "delete") {
        // Unassign leads od tohto usera + delete user
        const { data: user } = await admin
          .from("users")
          .select("auth_id")
          .eq("id", body.id)
          .maybeSingle();
        // Unassign
        await admin
          .from("leads")
          .update({ assigned_to: null })
          .eq("assigned_to", body.id);
        // Delete DB row
        const { error: delErr } = await admin.from("users").delete().eq("id", body.id);
        if (delErr) {
          return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
        }
        // Auth delete (best-effort — ignoruj chyby)
        if (user?.auth_id) {
          try {
            await admin.auth.admin.deleteUser(user.auth_id as string);
          } catch {
            /* silent — už zmazal DB row */
          }
        }
        return NextResponse.json({ ok: true, action: "delete" });
      }
    }

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const n = body.name.trim();
      if (!n) return NextResponse.json({ ok: false, error: "empty_name" }, { status: 400 });
      update.name = n;
    }
    if (body.phone !== undefined) {
      update.phone = body.phone ? body.phone.trim() : null;
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role as (typeof ROLES)[number])) {
        return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
      }
      // Bezpečnosť: admin sám sebe nemôže degradovať
      if (body.id === me.id && body.role !== "admin") {
        return NextResponse.json(
          { ok: false, error: "Nemôžeš si zmeniť rolu — iba iný admin to môže." },
          { status: 400 },
        );
      }
      update.role = body.role;
    }
    if (body.secondary_roles !== undefined) {
      const primary = (body.role ?? update.role) as string | undefined;
      const seen: Record<string, boolean> = {};
      const filtered: string[] = [];
      for (const r of body.secondary_roles) {
        if (!ROLES.includes(r as (typeof ROLES)[number])) continue;
        if (r === primary) continue;
        if (seen[r]) continue;
        seen[r] = true;
        filtered.push(r);
      }
      update.secondary_roles = filtered;
    }
    if (body.payout_percent !== undefined) {
      const p = Math.max(0, Math.min(100, Number(body.payout_percent) || 0));
      update.payout_percent = p;
    }
    if (body.home_city !== undefined) {
      update.home_city = body.home_city ? body.home_city.trim() : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
    }

    const { error } = await admin.from("users").update(update).eq("id", body.id);
    if (error) {
      console.error("[agent-update] db error:", error);
      return NextResponse.json(
        { ok: false, error: `DB: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, updated: Object.keys(update) });
  } catch (e) {
    console.error("[agent-update] unhandled:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
