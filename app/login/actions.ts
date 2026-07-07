"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dashboardPathForRole, type AppUserRole } from "@/lib/auth";
import { consume } from "@/lib/rate-limit";

/**
 * Zdieľané „demo/test" role-emaily — nemajú reálnu inbox, používajú sa
 * na preview role-viewu. Zadanie tohto emailu na /login → skip OTP,
 * rovno session cookies + redirect na jeho dashboard.
 *
 * BEZPEČNOSŤ: adresy vidieť z DB (musia mať public.users záznam). Kto
 * pozná email, zaloguje sa — čo je akceptovateľné pre interné shared
 * demo účty, ale NIKDY sem nesmie ísť admin ani reálny obchodák.
 *
 * Ak sa neskôr toto usmerní, staci to disablovať vymazaním emailu z
 * tejto sady.
 */
const INSTANT_LOGIN_EMAILS = new Set([
  "obhliadky@epoxidovo.sk",
  "realizacie@epoxidovo.sk",
]);

// Rate limit: 5 OTP requestov za 15 minút na IP (chráni SMTP kvótu + spam).
// Verify: 10 pokusov za 5 minút na IP (chráni pred brute-force OTP).
async function getClientIpFromHeaders(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

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

  // ── Rate limit (per IP) ──
  // 5 requestov / 15 min — bráni SMTP spam + generic abuse
  const ip = await getClientIpFromHeaders();
  const rl = consume(`otp-send:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    console.warn("[sendOtp] rate limited IP:", ip, "retry in", rl.retryAfterSec, "s");
    redirect(
      `/login?error=rate_limit&seconds=${rl.retryAfterSec}&email=${encodeURIComponent(email)}${testQuery}`,
    );
  }

  // ── Whitelist gate ──
  try {
    const admin = createAdminClient();
    const { data: appUser } = await admin
      .from("users")
      .select("id, email, active")
      .ilike("email", email)
      .maybeSingle();
    // Generic "unauthorized" pre OBE failure módy — bránime email enumeration.
    // (Predtým 'unauthorized' vs 'deactivated' odlišovalo či email existuje —
    // útočník mohol skenovať doménu.)
    if (!appUser || !appUser.active) {
      console.warn(
        "[sendOtp] BLOCKED — email not in whitelist or deactivated:",
        email,
        "(reason:",
        !appUser ? "not_found" : "deactivated",
        ")",
      );
      redirect(
        `/login?error=unauthorized&email=${encodeURIComponent(email)}${testQuery}`,
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

  // ── Instant login pre demo shared emaily (obhliadky@, realizacie@) ──
  // Preskočíme OTP → generujeme magic-link server-side → OTP token
  // spálime priamo cez verifyOtp() → session cookies sedia → redirect
  // na dashboard danej role.
  if (INSTANT_LOGIN_EMAILS.has(email)) {
    try {
      const admin = createAdminClient();
      const { data: linkData, error: linkErr } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
      const emailOtp = linkData?.properties?.email_otp;
      if (linkErr || !emailOtp) {
        console.error(
          "[instant-login] generateLink failed:",
          linkErr?.message ?? "no email_otp",
        );
        redirect(
          `/login?error=send_failed&email=${encodeURIComponent(email)}${testQuery}`,
        );
      }

      const supabase = await createClient();
      // type MUSÍ matchovať generateLink type ("magiclink") — "email" je
      // pre signInWithOtp flow a s magic-link tokenom nesedí.
      const { data: verifyData, error: verifyErr } =
        await supabase.auth.verifyOtp({
          email,
          token: emailOtp,
          type: "magiclink",
        });
      if (verifyErr || !verifyData?.user) {
        console.error(
          "[instant-login] verifyOtp failed:",
          verifyErr?.message ?? "no user",
        );
        redirect(
          `/login?error=send_failed&email=${encodeURIComponent(email)}${testQuery}`,
        );
      }

      // Načítaj rolu → správny dashboard
      const { data: appUser } = await admin
        .from("users")
        .select("role")
        .eq("auth_id", verifyData.user.id)
        .maybeSingle();
      const role = (appUser?.role ?? "obhliadky") as AppUserRole;

      // Update last_login_at (best-effort)
      await admin
        .from("users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("auth_id", verifyData.user.id);

      redirect(dashboardPathForRole(role));
    } catch (e) {
      // redirect() hodí NEXT_REDIRECT — musí prejsť ďalej
      if (
        typeof e === "object" &&
        e !== null &&
        "digest" in e &&
        String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
      ) {
        throw e;
      }
      console.error("[instant-login] unexpected error:", e);
      redirect(
        `/login?error=send_failed&email=${encodeURIComponent(email)}${testQuery}`,
      );
    }
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

  // ── Rate limit (per IP+email) — brute force OTP protection ──
  // 10 verify pokusov / 5 min. Kombinácia IP+email lebo attacker by mohol
  // spamovať cez viac tokenov na jeden email z jednej IP.
  const ip = await getClientIpFromHeaders();
  const rl = consume(`otp-verify:${ip}:${email}`, 10, 5 * 60 * 1000);
  if (!rl.allowed) {
    console.warn("[verifyOtp] rate limited:", ip, email);
    redirect(
      `/login/verify?email=${encodeURIComponent(email)}&error=rate_limit&seconds=${rl.retryAfterSec}`,
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
