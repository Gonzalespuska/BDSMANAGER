export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resend HTTP API (POST https://api.resend.com/emails) used directly
 * cez fetch — vyhneme sa SDK ktorý ťahá @react-email/render
 * a padá v edge-bundleri (Cloudflare Workers).
 */
async function sendViaResendApi(
  apiKey: string,
  payload: {
    from: string;
    to: string;
    subject: string;
    text: string;
    attachments?: Array<{ filename: string; content: string }>;
  },
): Promise<{ id?: string; error?: { message: string } }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };
  if (!res.ok) {
    return {
      error: { message: json.message || `Resend HTTP ${res.status}` },
    };
  }
  return { id: json.id };
}

/**
 * POST /api/quote/send
 *
 * Pošle cenovú ponuku zákazníkovi mailom.
 *
 * Body:
 *   {
 *     lead_id: string | null,        // ak je null = demo lead, nelogujeme do DB
 *     to_email: string,
 *     to_name: string,
 *     subject: string,
 *     body_text: string,
 *     pdf_base64: string,            // PDF bez data: prefixu
 *     pdf_filename: string
 *   }
 *
 * Ak RESEND_API_KEY je nastavený:
 *   → odošle email cez Resend
 *   → loguje email_sent activity (ak lead_id existuje)
 *   → vracia { ok: true, mode: "sent" }
 *
 * Ak nie je:
 *   → vracia { ok: false, error: "no_resend_key" } a UI fall-back na .eml download.
 */
export async function POST(request: NextRequest) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_resend_key",
        message:
          "RESEND_API_KEY nie je nastavený. Pridaj ho do .env.local pre auto-send emailov.",
      },
      { status: 503 },
    );
  }

  let body: {
    lead_id?: string | null;
    to_email?: string;
    to_name?: string;
    subject?: string;
    body_text?: string;
    pdf_base64?: string;
    pdf_filename?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!body.to_email || !body.subject || !body.body_text || !body.pdf_base64) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  const fromAddress =
    process.env.QUOTE_EMAIL_FROM ?? "EPOXIDOVO <onboarding@resend.dev>";

  try {
    const { id: resendId, error } = await sendViaResendApi(resendKey, {
      from: fromAddress,
      to: body.to_email,
      subject: body.subject,
      text: body.body_text,
      attachments: [
        {
          filename: body.pdf_filename ?? "ponuka.pdf",
          content: body.pdf_base64,
        },
      ],
    });

    if (error) {
      console.error("[quote/send] Resend error:", error);
      return NextResponse.json(
        { ok: false, error: "resend_failed", message: error.message },
        { status: 500 },
      );
    }

    // Log do lead_activities + presun lead-u do "Otvorené" (status=quote_sent)
    if (body.lead_id && !body.lead_id.startsWith("demo-")) {
      try {
        const admin = createAdminClient();
        const nowIso = new Date().toISOString();

        // Audit log
        await admin.from("lead_activities").insert({
          lead_id: body.lead_id,
          type: "email_sent",
          data: {
            to: body.to_email,
            subject: body.subject,
            resend_id: resendId,
            kind: "quote",
          },
        });

        // Update status: quote_sent → posunie lead z Kontakt do Otvorené tabu.
        // Nedotýkame sa už-finálnych stavov (won/lost/archived).
        const { data: leadRow } = await admin
          .from("leads")
          .select("status")
          .eq("id", body.lead_id)
          .maybeSingle();
        if (
          leadRow &&
          !["won", "lost", "archived"].includes(leadRow.status)
        ) {
          await admin
            .from("leads")
            .update({ status: "quote_sent", last_activity_at: nowIso })
            .eq("id", body.lead_id);
        }
      } catch (e) {
        console.warn("[quote/send] activity log / status update failed:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "sent",
      message: `Ponuka odoslaná na ${body.to_email}`,
      resend_id: resendId,
    });
  } catch (err) {
    console.error("[quote/send] exception:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "exception",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}
