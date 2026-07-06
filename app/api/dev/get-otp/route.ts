export const runtime = "edge";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { assertDevOnly } from "@/lib/dev-guard";

// runtime = "edge" disabled — @supabase/supabase-js admin fetch fails in Next edge dev

/**
 * GET /api/dev/get-otp?email=<email>
 *
 * DEV-ONLY helper: vygeneruje OTP kód pre daný email cez admin API, vráti ho
 * v JSON odpovedi. Žiadny email sa neposiela → nepoužívame Supabase free tier
 * SMTP kvótu, žiadny rate limit.
 *
 * Použitie:
 *   curl http://localhost:3100/api/dev/get-otp?email=info@epoxidovo.sk
 *   → { ok: true, otp: "123456", verify_url: "/login/verify?email=..." }
 *
 * SECURITY: v production NODE_ENV='production' vráti 403. V dev móde je
 * verejne dostupný — kto má prístup k localhost vie OTP pre koho-koľvek.
 * To je OK lebo lokálne ďalší ľudia nemajú prístup.
 */
export async function GET(request: Request) {
  const blocked = assertDevOnly(request);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const email = (
    searchParams.get("email") ??
    process.env.BOOTSTRAP_ADMIN_EMAIL ??
    ""
  )
    .trim()
    .toLowerCase();

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Missing ?email param" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "generateLink returned no properties",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    email,
    otp: data.properties.email_otp,
    expires_at: "1 hour from now",
    verify_url: `/login/verify?email=${encodeURIComponent(email)}`,
    instructions:
      "Skopíruj otp, otvor verify_url, paste-uj kód, klikni Prihlásiť sa.",
  });
}
