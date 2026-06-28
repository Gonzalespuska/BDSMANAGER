"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dashboardPathForRole, type AppUserRole } from "@/lib/auth";

/**
 * Server Action — odošle 6-cifr OTP kód na email.
 *
 * Strict whitelist flow:
 *   1. Validuje email.
 *   2. Skontroluje že email existuje v public.users s active=true. Ak nie,
 *      redirect na /login?error=unauthorized BEZ poslania OTP (žiadny spam
 *      nepoznaným e-mailom, žiadne enumeration leakovanie nie je nutné
 *      lebo Epoxidovo tím vie kto má prístup).
 *   3. signInWithOtp({ email, shouldCreateUser: false }) → Supabase pošle kód
 *      iba ak auth.users záznam existuje. Admin user creation script
 *      (scripts/add-agent.mjs) zaisťuje že auth.users a public.users
 *      idú spolu.
 *   4. Redirect na /login/verify?email=...
 */
export async function sendOtpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const testMode = String(formData.get("test") ?? "") === "1";
  const testQuery = testMode ? "&test=1" : "";

  if (!email) {
    redirect("/login?error=missing_email" + testQuery);
  }

  // ── Whitelist gate ──
  try {
    const admin = createAdminClient();
    const { data: appUser } = await admin
      .from("users")
      .select("id, email, active")
      .ilike("email", email)
      .maybeSingle();
    if (!appUser) {
      console.warn("[sendOtp] BLOCKED — email not in whitelist:", email);
      redirect(
        `/login?error=unauthorized&email=${encodeURIComponent(email)}${testQuery}`,
      );
    }
    if (!appUser.active) {
      console.warn("[sendOtp] BLOCKED — user deactivated:", email);
      redirect(
        `/login?error=deactivated&email=${encodeURIComponent(email)}${testQuery}`,
      );
    }
  } catch (e) {
    // redirect throws NEXT_REDIRECT, ktoré sa propaguje cez try/catch.
    // Skontrolujeme či je to redirect — ak áno, throw ďalej.
    if (
      typeof e === "object" &&
      e !== null &&
      "digest" in e &&
      String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    console.error("[sendOtp] whitelist lookup error:", e);
    redirect(`/login?error=send_failed&email=${encodeURIComponent(email)}${testQuery}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // false = iba pre-existujúci uživatelia (admin musí dopredu pozvať)
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.warn("[sendOtp] failed for", email, error.message);
    const lower = error.message.toLowerCase();

    if (
      lower.includes("signups not allowed") ||
      lower.includes("not allowed")
    ) {
      redirect(
        `/login?error=unauthorized&email=${encodeURIComponent(email)}${testQuery}`,
      );
    }

    // Rate limit: "For security purposes, you can only request this after X seconds."
    if (lower.includes("security purposes") || lower.includes("rate limit")) {
      const match = error.message.match(/after (\d+) seconds?/i);
      const secs = match ? match[1] : "60";
      redirect(
        `/login?error=rate_limit&seconds=${secs}&email=${encodeURIComponent(email)}${testQuery}`,
      );
    }

    redirect(`/login?error=send_failed&email=${encodeURIComponent(email)}${testQuery}`);
  }

  redirect(`/login/verify?email=${encodeURIComponent(email)}${testQuery}`);
}

/**
 * Server Action — overí 6-cifr kód a prihlási usera.
 *
 * Flow:
 *   1. Validuje email + token
 *   2. verifyOtp({ email, token, type: 'email' })
 *   3. Skontroluje že existuje public.users s active=true
 *   4. Update last_login_at
 *   5. Redirect na /admin alebo /agent podľa role
 */
export async function verifyOtpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const token = String(formData.get("token") ?? "").trim();

  if (!email || !token) {
    redirect(
      `/login/verify?email=${encodeURIComponent(email)}&error=missing`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    console.warn("[verifyOtp] failed for", email, error?.message);
    redirect(
      `/login/verify?email=${encodeURIComponent(email)}&error=invalid`,
    );
  }

  // Skontroluj public.users
  const { data: appUser, error: lookupError } = await supabase
    .from("users")
    .select("role, active")
    .eq("auth_id", data.user.id)
    .maybeSingle();

  if (lookupError || !appUser) {
    console.warn(
      "[verifyOtp] no public.users row for",
      email,
      lookupError?.message,
    );
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  if (!appUser.active) {
    await supabase.auth.signOut();
    redirect("/login?error=deactivated");
  }

  // Update last_login_at (best-effort)
  await supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("auth_id", data.user.id);

  redirect(dashboardPathForRole(appUser.role as AppUserRole));
}

/**
 * Server Action — odhlásenie.
 */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
