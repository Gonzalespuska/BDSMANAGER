import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

/**
 * GET /api/dev/login?email=<email>&redirectTo=<path>
 *
 * DEV-ONLY one-click login:
 *   1. Vygeneruje OTP cez admin API (admin.generateLink → email_otp)
 *   2. Hneď verifuje OTP cez SSR client → set Supabase session cookies
 *      na náš localhost domain (kľúčové — Supabase verify endpoint by ich
 *      inak nastavil na vlastnej supabase.co doméne a my by sme ich nevideli)
 *   3. Redirect na /admin (alebo ?redirectTo=)
 *
 * V production NODE_ENV='production' vráti 403.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Disabled in production", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const email = (
    searchParams.get("email") ??
    process.env.BOOTSTRAP_ADMIN_EMAIL ??
    ""
  )
    .trim()
    .toLowerCase();

  if (!email) {
    return new NextResponse("Missing ?email param", { status: 400 });
  }

  const redirectTo = searchParams.get("redirectTo") ?? "/admin";

  // 1) Generuj OTP token cez admin API (nesposiela email)
  const admin = createAdminClient();
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError || !linkData?.properties?.email_otp) {
    return new NextResponse(
      `generateLink failed: ${linkError?.message ?? "no email_otp"}`,
      { status: 500 },
    );
  }

  const otp = linkData.properties.email_otp;

  // 2) Verify OTP cez SSR client → toto nastaví auth cookies na localhost
  const supabase = await createClient();
  const { data: verifyData, error: verifyError } =
    await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

  if (verifyError || !verifyData.user) {
    return new NextResponse(
      `verifyOtp failed: ${verifyError?.message ?? "no user"}`,
      { status: 500 },
    );
  }

  // 3) Update last_login_at (best-effort)
  await supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("auth_id", verifyData.user.id);

  // 4) Redirect na dashboard
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
