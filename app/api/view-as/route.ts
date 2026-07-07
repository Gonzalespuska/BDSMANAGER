export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dashboardPathForRole } from "@/lib/roles";

/**
 * POST /api/view-as
 * body:
 *   • { role: 'obchod' | 'obhliadky' | 'realizacie' | 'office' | 'skolenie' | 'clear' }
 *     — set/clear view_as_role cookie (generic role impersonation)
 *   • { user_id: string }
 *     — set view_as_user_id cookie (per-user impersonation, admin vidí
 *       presne to co Leo). Automaticky clearne view_as_role.
 *
 * Bezpečnosť: iba admin môže view-as.
 */
const VALID_ROLES = [
  "obchod",
  "obhliadky",
  "realizacie",
  "office",
  "skolenie",
] as const;

export async function POST(request: Request) {
  const realRole = await getRealUserRole();
  if (realRole !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const role = body.role as string | undefined;
  const userId = body.user_id as string | undefined;

  // ─── PER-USER impersonation ────────────────────────────────────────
  if (userId) {
    // Overiť že user existuje + získať jeho rolu (pre redirect na
    // správny dashboard).
    const sb = createAdminClient();
    const { data: target } = await sb
      .from("users")
      .select("id, role, active")
      .eq("id", userId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "user_not_found" },
        { status: 404 },
      );
    }
    if (!target.active) {
      return NextResponse.json(
        { ok: false, error: "user_inactive" },
        { status: 400 },
      );
    }
    const redirectTo =
      target.role === "obhliadky"
        ? "/obhliadky"
        : target.role === "realizacie"
          ? "/realizacie"
          : target.role === "office"
            ? "/office"
            : target.role === "skolenie"
              ? "/skolenie"
              : "/agent"; // obchod / admin
    const res = NextResponse.json({ ok: true, redirect: redirectTo });
    res.cookies.set("view_as_user_id", userId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    // Vypni prípadné view_as_role — konfliktné
    res.cookies.delete("view_as_role");
    return res;
  }

  // ─── PER-ROLE impersonation (existujúce správanie) ─────────────────
  const redirectTo = (() => {
    if (role === "clear") return "/admin";
    if (role === "office") return "/office";
    if (role === "skolenie") return "/skolenie";
    if (VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
      return dashboardPathForRole(role as "obchod" | "obhliadky" | "realizacie");
    }
    return null;
  })();

  if (!redirectTo) {
    return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, redirect: redirectTo });

  if (role === "clear") {
    res.cookies.delete("view_as_role");
    res.cookies.delete("view_as_user_id");
  } else {
    res.cookies.set("view_as_role", role!, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    // Vypni per-user impersonation aby to nekolidovalo
    res.cookies.delete("view_as_user_id");
  }

  return res;
}
