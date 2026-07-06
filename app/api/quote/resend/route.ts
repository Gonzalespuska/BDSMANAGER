export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * POST /api/quote/resend
 *
 * Rýchle re-poslanie CP z uloženého lead.data.last_quote (obsahuje PDF base64).
 * Obchodník môže dopísať vlastný text pred odoslaním.
 *
 * Body: { lead_id: string, body_text: string }
 * Vyžaduje že /api/quote/send bol už raz spustený (uložil last_quote + PDF).
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json(
      { ok: false, error: "no_resend_key" },
      { status: 503 },
    );
  }

  let body: { lead_id?: string; body_text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.lead_id || !body.body_text?.trim()) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (body.body_text.length > 20000) {
    return NextResponse.json({ ok: false, error: "too_long" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: lead } = await admin
    .from("leads")
    .select("assigned_to, data, email, name")
    .eq("id", body.lead_id)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
  }
  if (lead.assigned_to !== user.id && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden_not_your_lead" },
      { status: 403 },
    );
  }

  const data = (lead.data ?? {}) as Record<string, unknown>;
  const lastQuote = (data.last_quote ?? null) as
    | {
        pdf_base64?: string;
        pdf_filename?: string;
        to_email?: string;
        subject?: string;
      }
    | null;

  if (!lastQuote?.pdf_base64) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_saved_pdf",
        message:
          "Pre tento lead nie je uložená CP. Najprv vytvor cenovú ponuku v generátore a odošli.",
      },
      { status: 400 },
    );
  }

  const to = lastQuote.to_email || (lead.email as string) || "";
  const subject = lastQuote.subject || "Cenová ponuka — EPOXIDOVO.SK";

  // Fire Resend
  try {
    const defaultFrom =
      process.env.QUOTE_EMAIL_FROM ?? "EPOXIDOVO <noreply@najcrm.sk>";
    const fromAddress = user.name
      ? defaultFrom.replace(/^[^<]+/, `${user.name} (EPOXIDOVO) `)
      : defaultFrom;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to,
        reply_to: user.email,
        bcc: user.email,
        subject,
        text: body.body_text,
        attachments: [
          {
            filename: lastQuote.pdf_filename ?? "ponuka.pdf",
            content: lastQuote.pdf_base64,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "resend_failed", message: err.slice(0, 200) },
        { status: 500 },
      );
    }

    // Log activity
    admin
      .from("lead_activities")
      .insert({
        lead_id: body.lead_id,
        user_id: user.id,
        type: "email_sent",
        data: { to, subject, kind: "quote", resend_mode: "quick" },
      })
      .then(() => {})
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      mode: "sent",
      message: `Ponuka odoslaná na ${to}`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
