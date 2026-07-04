export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRealUserRole } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";

/**
 * POST /api/view-as
 * body: { role: 'obchod' | 'obhliadky' | 'realizacie' | 'office' | 'clear' }
 *
 * Set / clear view_as_role cookie. Client potom robí window.location.href
 * na správny dashboard.
 *
 * Bezpečnosť: iba admin môže view-as.
 */
const VALID_ROLES = ["obchod", "obhliadky", "realizacie", "office"] as const;

export async function POST(request: Request) {
  const realRole = await getRealUserRole();
  if (realRole !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const role = body.role as string | undefined;

  const redirectTo = (() => {
    if (role === "clear") return "/admin";
    if (role === "office") return "/office";
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
  } else {
    res.cookies.set("view_as_role", role!, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      // Session-only (bez maxAge → session cookie)
    });
  }

  return res;
}
