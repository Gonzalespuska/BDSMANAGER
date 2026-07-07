export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * Sanitize string pre email header — odstráni CR/LF/Tab a kontrolné znaky
 * aby attacker nemohol pridať fake hlavičky (header injection).
 */
function sanitizeHeader(s: string): string {
  return s.replace(/[\r\n\t\x00-\x1f\x7f]/g, " ").trim().slice(0, 200);
}

const EMAIL_RE = /^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/;

/** HTML escape — bezpečné vloženie user contentu do HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Konvertuje plain-text body na HTML email s brandovanou signatúrou.
 *
 * Rozdelí body na 2 časti:
 *   1) Text nad "S pozdravom," — normálne odstavce
 *   2) Signatúra (od "S pozdravom" nižšie) — obalíme do brand kartičky
 *      s modro-štylizovaným "EPOXIDOVO.SK" nadpisom
 *
 * Prečo HTML: text-only email ma problém s workspace "append footer"
 * (Google Workspace pridá vlastný footer). HTML s explicitne
 * brandovanou signatúrou => user si Gmail workspace signature vypne
 * a všetci obchodáci majú KONZISTENTNÝ format.
 */
function buildHtmlFromPlainText(text: string, agentEmail: string): string {
  // Split na body vs signature (marker: "S pozdravom")
  const idx = text.indexOf("S pozdravom");
  const bodyPart = idx >= 0 ? text.slice(0, idx).trim() : text;
  const sigPart = idx >= 0 ? text.slice(idx).trim() : "";

  // Body → <p> paragrafy
  const bodyHtml = bodyPart
    .split(/\n\n+/)
    .map((p) => `<p style="margin: 0 0 14px 0; line-height: 1.6;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  // Signature parsing — riadky bez "S pozdravom," headera
  const sigLines = sigPart
    .split("\n")
    .filter((l) => l.trim() && !l.trim().match(/^S pozdravom,?$/i));
  // Očakávaný poradie: [meno, telefón, "EPOXIDOVO s. r. o.", email, www]
  const [maybeName, ...rest] = sigLines;
  const agentName = maybeName || "";
  const phoneLine = rest.find((l) => /^\+?\d/.test(l.trim()));
  const emailLine =
    rest.find((l) => l.includes("@")) || agentEmail || "info@epoxidovo.sk";
  const wwwLine =
    rest.find((l) => /^www\./i.test(l.trim())) || "www.epoxidovo.sk";

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cenová ponuka</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background: #f8fafc;">
<div style="max-width: 640px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

<!-- Body text -->
<div style="font-size: 15px; color: #1e293b;">
${bodyHtml}
</div>

<!-- Signature — brand block -->
<div style="margin-top: 32px; padding-top: 20px; border-top: 2px solid #e2e8f0;">
  <div style="font-size: 15px; margin-bottom: 12px;">S pozdravom,</div>
  <div style="margin-bottom: 12px;"><img src="https://app.najcrm.sk/epoxidovo-logo.png" alt="EPOXIDOVO.SK" width="180" height="66" style="display: block; width: 180px; height: 66px; border: 0;"></div>
  <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(agentName)}</div>
  ${phoneLine ? `<div style="font-size: 14px; color: #475569; margin-top: 4px; font-variant-numeric: tabular-nums;">${escapeHtml(phoneLine.trim())}</div>` : ""}
  <div style="font-size: 14px; margin-top: 4px;"><a href="mailto:${escapeHtml(emailLine.trim())}" style="color: #0284c7; text-decoration: none;">${escapeHtml(emailLine.trim())}</a></div>
  <div style="font-size: 14px; margin-top: 2px;"><a href="https://${escapeHtml(wwwLine.replace(/^www\./, "").trim())}" style="color: #0284c7; text-decoration: none;">${escapeHtml(wwwLine.trim())}</a></div>
</div>

<!-- Prevention: skryje Gmail workspace "append footer" duplicity -->
<div style="margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center;">
  📎 PDF cenová ponuka je v prílohe.
</div>

</div>
</body>
</html>`;
}

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
          // Neprepisujeme finalne statusy ani vyssie kroky pipeline.
          // needs_inspection / in_realization su vyssie ako quote_sent —
          // nechceme downgrade po poslani novej upraveny CP.
          !["won", "lost", "archived", "needs_inspection", "in_realization", "inspected"].includes(
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
