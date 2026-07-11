export const runtime = "edge";

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";
import { buildHtmlFromPlainText } from "@/lib/email/build-html";

/**
 * Sanitize string pre email header — odstráni CR/LF/Tab a kontrolné znaky
 * aby attacker nemohol pridať fake hlavičky (header injection).
 */
function sanitizeHeader(s: string): string {
  return s.replace(/[\r\n\t\x00-\x1f\x7f]/g, " ").trim().slice(0, 200);
}

const EMAIL_RE = /^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/;

// HTML signature builder extrakted do lib/email/build-html.ts — zdielany
// s /api/quote/resend a buducim /api/lead/email endpointom.

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
    html?: string;
    bcc?: string | string[];
    reply_to?: string | string[];
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
  // AUTH: iba prihlásený obchodník/admin smie posielať ponuky
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

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
    /** Email obchodáka (Reply-To + BCC copy do jeho inboxu) */
    agent_email?: string;
    /** Meno obchodáka — vloží sa do From display name */
    agent_name?: string;
    /**
     * Snapshot generátorového stavu — uloží sa do lead.data.last_quote,
     * aby obchodník mohol CP neskôr upraviť a poslať znova.
     * Klient poskytuje ľubovoľný JSON blob (validujeme len že je objekt).
     */
    quote_state?: Record<string, unknown>;
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

  // Validácia emailov + sanitácia hlavičiek (anti header-injection)
  if (!EMAIL_RE.test(body.to_email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_to_email" },
      { status: 400 },
    );
  }
  // Length-limit prevencia DoS/spam
  if (body.subject.length > 200 || body.body_text.length > 20000) {
    return NextResponse.json(
      { ok: false, error: "too_long" },
      { status: 400 },
    );
  }

  // OWNERSHIP: ak je lead_id, over že patrí tomu kto posiela (alebo admin)
  if (body.lead_id) {
    const admin = createAdminClient();
    const { data: lead } = await admin
      .from("leads")
      .select("assigned_to")
      .eq("id", body.lead_id)
      .maybeSingle();
    if (!lead) {
      return NextResponse.json(
        { ok: false, error: "lead_not_found" },
        { status: 404 },
      );
    }
    if (lead.assigned_to !== user.id && user.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "forbidden_not_your_lead" },
        { status: 403 },
      );
    }
  }

  // Anti-spoofing: agent_email MUSÍ patriť aktuálnemu prihlásenému userovi.
  // Inak by mohol kdokoľvek nastaviť Reply-To na cudzí email.
  const safeAgentEmail =
    body.agent_email && body.agent_email.toLowerCase() === user.email.toLowerCase()
      ? body.agent_email
      : user.email;
  const safeAgentName = sanitizeHeader(body.agent_name || user.name);
  const safeSubject = sanitizeHeader(body.subject);

  // From: agent meno (sanitized) v display časti; doména z env (verified Resend).
  const defaultFrom =
    process.env.QUOTE_EMAIL_FROM ?? "EPOXIDOVO <noreply@najcrm.sk>";
  const fromAddress = safeAgentName
    ? defaultFrom.replace(/^[^<]+/, `${safeAgentName} (EPOXIDOVO) `)
    : defaultFrom;

  // Konvertuj plain text body na HTML — text ostane ako fallback pre
  // starých klientov / spam filtre. HTML má peknu brandovanu signaturu
  // s "EPOXIDOVO.SK" logo textom.
  const htmlBody = buildHtmlFromPlainText(body.body_text, safeAgentEmail);

  try {
    const { id: resendId, error } = await sendViaResendApi(resendKey, {
      from: fromAddress,
      to: body.to_email,
      // Reply-To: zákazník klikne Reply → ide priamo obchodákovi (over. email)
      reply_to: safeAgentEmail,
      // BCC: obchodák dostane kópiu do svojho Gmail inboxu (vidí to v Sent)
      bcc: safeAgentEmail,
      subject: safeSubject,
      text: body.body_text,
      html: htmlBody,
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

        // Audit log — s user_id, aby sa dalo priradiť ku obchodákovi
        // v prehľade rolí + top výkonu.
        await admin.from("lead_activities").insert({
          lead_id: body.lead_id,
          user_id: user.id,
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
        // Zároveň uložíme snapshot generátorového stavu do data.last_quote
        // aby obchodník mohol CP neskôr upraviť a poslať znova.
        const { data: leadRow } = await admin
          .from("leads")
          .select("status, data")
          .eq("id", body.lead_id)
          .maybeSingle();
        if (
          leadRow &&
          // Neprepisujeme LEN skutočne finálne stavy alebo vyššie kroky
          // pipeline (in_realization).
          //   • 'inspected'   → MÔŽE ísť do quote_sent (obchodák pošle CP
          //                    z /obhliadnute po dokončenej obhliadke) —
          //                    predtým tu blokované, čo bol BUG.
          //   • needs_inspection → tiež môže (ak by obchodák poslal ori-
          //                    entačnú CP pred obhliadkou — nechceme
          //                    blokovať UX).
          //   • won/lost/archived → finálne stavy, nepovoľujeme
          //   • in_realization → prebieha realizácia, nekonzistentné
          !["won", "lost", "archived", "in_realization"].includes(
            leadRow.status,
          )
        ) {
          const existingData =
            (leadRow.data as Record<string, unknown> | null) ?? {};
          const nextData: Record<string, unknown> = { ...existingData };
          if (
            body.quote_state &&
            typeof body.quote_state === "object" &&
            !Array.isArray(body.quote_state)
          ) {
            // Uložíme aj PDF base64 + subject + to_email pre resend flow
            nextData.last_quote = {
              ...body.quote_state,
              pdf_base64: body.pdf_base64,
              pdf_filename: body.pdf_filename ?? "ponuka.pdf",
              to_email: body.to_email,
              subject: body.subject,
            };
          }
          await admin
            .from("leads")
            .update({
              status: "quote_sent",
              last_activity_at: nowIso,
              data: nextData,
            })
            .eq("id", body.lead_id);
        }
      } catch (e) {
        console.warn("[quote/send] activity log / status update failed:", e);
      }
    }

    // Revaliduj kľúčové stránky — obchodákovi zhasne badge "Obhliadnuté",
    // /obhliadnute karty aktualizuju status, kalendár vyfarbí LeadEventCard.
    try {
      revalidatePath("/obhliadnute");
      revalidatePath("/notifikacie");
      revalidatePath("/calendar");
      revalidatePath("/agent");
    } catch {
      /* revalidatePath môže failnúť pri edge runtime bez cache — ignoruj */
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
