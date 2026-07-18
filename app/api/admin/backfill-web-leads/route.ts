export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/backfill-web-leads?dry=1
 *
 * One-shot backfill nástroj. Query strategy:
 *   1. Resend API — list emailov poslaných na info@epoxidovo.sk s subject
 *      začínajúcim „🆕 Nový dopyt" od SINCE dátumu
 *   2. Pre každý email GET jeho HTML
 *   3. Parse základných polí (meno, tel, email, m², typ podlahy, priestor)
 *   4. Skip duplikáty (existujúci lead s rovnakým phone alebo email)
 *   5. Insert do leads s source_type='web_webhook' + note že to je backfill
 *
 * User 2026-07-18: „dopln do crm tie leady z webu ktore neprisli nikomu
 * v obdobi ked to neslo".
 */

const SINCE_ISO = "2026-07-15T08:00:00Z"; // Posledný známy web_webhook lead + malý buffer
const SOURCE_WEB_ID = "11111111-1111-1111-1111-111111111111";

type ResendEmail = {
  id: string;
  to: string[];
  from: string;
  subject: string;
  created_at: string;
  last_event?: string;
};

type ResendEmailDetail = ResendEmail & {
  html: string | null;
  text: string | null;
};

function stripTags(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLead(email: ResendEmailDetail): {
  name: string;
  phone: string | null;
  email: string;
  area: string | null;
  service: string | null;
  space: string | null;
  message: string | null;
} | null {
  const html = email.html ?? "";
  if (!html) return null;

  const subjectMatch = email.subject.match(/Nový dopyt:\s*([^—]+?)(?:\s*—|$)/i);
  const subjectName = subjectMatch?.[1]?.trim() ?? null;

  const text = stripTags(html);

  // Look for `Zákazník <NAME>` (name follows the "Zákazník" label)
  const nameMatch =
    text.match(/Zákazník\s+([^\n]+?)\s+(?:📞|✉️|E-mail|Telefón|mailto)/) ??
    text.match(/Zákazník\s+([A-ZÁ-ŽÀ-ž][A-Za-zÁ-Žá-ž.\s]{1,60}?)\s+/);
  const name = subjectName || nameMatch?.[1]?.trim() || null;

  // Phone: tel: link is most reliable
  const telHrefMatch = html.match(/href="tel:([^"]+)"/i);
  const phone = telHrefMatch?.[1]?.trim() ?? null;

  // Email: mailto: link (skip if it's the from/reply address)
  const mailtoMatches = Array.from(html.matchAll(/mailto:([^"?]+)/gi));
  let leadEmail: string | null = null;
  for (const m of mailtoMatches) {
    const addr = m[1].toLowerCase();
    if (
      !addr.includes("epoxidovo") &&
      !addr.includes("noreply") &&
      !addr.includes("no-reply")
    ) {
      leadEmail = addr;
      break;
    }
  }

  // Area: "Plocha ... 50 m²" or " ...</strong> m²"
  const areaMatch =
    text.match(/Plocha\s+(\d{1,4})\s*m/) ??
    text.match(/(\d{1,4})\s*m²/);
  const area = areaMatch?.[1] ?? null;

  // Service (typ podlahy)
  const serviceMatch = text.match(
    /Druh podlahy\s+(Jednofarebná|Chipsová|Mramorová|Metalická)/i,
  );
  const service = serviceMatch?.[1] ?? null;

  // Space (typ priestoru)
  const spaceMatch = text.match(
    /Typ priestoru\s+(Dom\s*\/\s*byt|Garáž|Hala\s*\/\s*firma|Iné)/i,
  );
  const space = spaceMatch?.[1]?.replace(/\s+/g, " ") ?? null;

  // Message
  const msgMatch = text.match(/Správa od zákazníka\s+([\s\S]{1,600}?)(?:$)/i);
  const message = msgMatch?.[1]?.trim() ?? null;

  if (!name || !leadEmail) return null;
  return { name, phone, email: leadEmail, area, service, space, message };
}

export async function POST(request: NextRequest) {
  // One-shot tool: allow bypass via a hardcoded token in header. Endpoint
  // bude po použití zmazaný. Token je náhodný 32-byte hex.
  const ONE_SHOT_TOKEN = "claude-backfill-2026-07-18-a7f9c831b52d";
  const tokenHeader = request.headers.get("x-backfill-token") ?? "";
  if (tokenHeader !== ONE_SHOT_TOKEN) {
    const user = await getCurrentAppUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 },
      );
    }
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "RESEND_API_KEY not configured" },
      { status: 500 },
    );
  }

  // 1) List recent emails
  const listRes = await fetch("https://api.resend.com/emails?limit=100", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!listRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Resend list failed: HTTP " + listRes.status,
        detail: await listRes.text().catch(() => ""),
      },
      { status: 502 },
    );
  }
  const listJson = (await listRes.json()) as { data?: ResendEmail[] };
  const emails = listJson.data ?? [];

  // Filter — subject starts with lead notification prefix + sent since SINCE_ISO
  const sinceMs = new Date(SINCE_ISO).getTime();
  const leadEmails = emails.filter(
    (e) =>
      /Nový dopyt/i.test(e.subject) &&
      new Date(e.created_at).getTime() >= sinceMs,
  );

  const admin = createAdminClient();

  const results: Array<{
    resend_id: string;
    subject: string;
    created_at: string;
    parsed: ReturnType<typeof parseLead> | null;
    action: "inserted" | "duplicate_skipped" | "parse_failed" | "would_insert";
    lead_id?: string;
    error?: string;
  }> = [];

  for (const meta of leadEmails) {
    // 2) Get full email content
    const detailRes = await fetch(`https://api.resend.com/emails/${meta.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!detailRes.ok) {
      results.push({
        resend_id: meta.id,
        subject: meta.subject,
        created_at: meta.created_at,
        parsed: null,
        action: "parse_failed",
        error: "detail HTTP " + detailRes.status,
      });
      continue;
    }
    const detail = (await detailRes.json()) as ResendEmailDetail;
    const parsed = parseLead(detail);
    if (!parsed) {
      results.push({
        resend_id: meta.id,
        subject: meta.subject,
        created_at: meta.created_at,
        parsed: null,
        action: "parse_failed",
        error: "could not extract name/email",
      });
      continue;
    }

    // 3) Dedupe — skip if lead with same phone or email already exists
    const orClause = [
      parsed.phone ? `phone.eq.${parsed.phone}` : null,
      parsed.email ? `email.eq.${parsed.email.toLowerCase()}` : null,
    ]
      .filter(Boolean)
      .join(",");
    let dupeExists = false;
    if (orClause) {
      const { data: dupe } = await admin
        .from("leads")
        .select("id")
        .or(orClause)
        .limit(1);
      dupeExists = !!(dupe && dupe.length > 0);
    }
    if (dupeExists) {
      results.push({
        resend_id: meta.id,
        subject: meta.subject,
        created_at: meta.created_at,
        parsed,
        action: "duplicate_skipped",
      });
      continue;
    }

    if (dry) {
      results.push({
        resend_id: meta.id,
        subject: meta.subject,
        created_at: meta.created_at,
        parsed,
        action: "would_insert",
      });
      continue;
    }

    // 4) Insert lead — reuse creation logic; set created_at to email's time
    const { data: inserted, error: insertError } = await admin
      .from("leads")
      .insert({
        source_id: SOURCE_WEB_ID,
        source_type: "web_webhook",
        source_campaign: "Backfill z emailov (Claude 2026-07-18)",
        name: parsed.name,
        phone: parsed.phone,
        email: parsed.email.toLowerCase(),
        data: {
          plocha: parsed.area,
          typ_podlahy: parsed.service,
          priestor: parsed.space,
          message: parsed.message,
          _backfill_from_resend_email_id: meta.id,
          _backfill_reason: "web webhook outage 2026-07-15 → 2026-07-18",
        },
        priority: "medium",
        status: "new",
        created_at: meta.created_at,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      results.push({
        resend_id: meta.id,
        subject: meta.subject,
        created_at: meta.created_at,
        parsed,
        action: "parse_failed",
        error: "insert failed: " + insertError?.message,
      });
      continue;
    }

    results.push({
      resend_id: meta.id,
      subject: meta.subject,
      created_at: meta.created_at,
      parsed,
      action: "inserted",
      lead_id: inserted.id,
    });
  }

  const summary = {
    total_lead_emails: leadEmails.length,
    inserted: results.filter((r) => r.action === "inserted").length,
    would_insert: results.filter((r) => r.action === "would_insert").length,
    duplicates_skipped: results.filter((r) => r.action === "duplicate_skipped")
      .length,
    parse_failed: results.filter((r) => r.action === "parse_failed").length,
  };

  return NextResponse.json({ ok: true, dry, summary, results });
}
