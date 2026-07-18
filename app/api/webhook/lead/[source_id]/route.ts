export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { LeadWebhookInputSchema } from "@/lib/schemas/lead";

/**
 * Constant-time string comparison — chráni proti timing side-channel
 * attacks pri overovaní webhook secrets. Štandardné `===` skratuje pri
 * prvom rozdiele a útočník vie merať čas medzi requestmi → unáša bajt
 * po bajte. Tento helper porovnáva každý znak bez early-exit.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// runtime = "edge" disabled — @supabase/supabase-js admin fetch fails in Next edge dev

/**
 * POST /api/webhook/lead/[source_id]
 *
 * Hlavný intake endpoint pre nové leady. Volaný:
 *   - Z epoxidovo.sk web formulára (cez fetch z client / server)
 *   - Z Facebook / Instagram Lead Ads webhooku (po OAuth setup)
 *   - Z Google Ads Lead Form Extensions
 *   - Z dev seed helpera
 *
 * Auth: každý source má vlastný webhook_secret. Volajúci musí poslať
 *       header `X-Webhook-Secret: <secret>`. Ak source nemá secret
 *       (napr. manuálny zdroj), preskočí sa overovanie.
 *
 * Body (JSON):
 *   {
 *     "name": "Janko Mrkvička",
 *     "phone": "+421900123456",   // alebo email
 *     "email": "janko@example.sk",
 *     "source_campaign": "FB Garažové podlahy",
 *     "priority": "high",
 *     "data": { "plocha": "35", "lokalita": "BA", ... }
 *   }
 *
 * Response 201: { ok: true, lead_id: "uuid" }
 * Response 4xx: { ok: false, error: "..." }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ source_id: string }> },
) {
  const { source_id } = await context.params;
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const ua = request.headers.get("user-agent") ?? null;
  const providedSecretHeader = request.headers.get("x-webhook-secret") ?? "";
  const admin = createAdminClient();

  // Best-effort body preview — nezávisle od validácie
  let bodyPreview = "";
  try {
    const raw = await request.clone().text();
    bodyPreview = raw.slice(0, 2048);
  } catch {
    /* ignore */
  }

  async function audit(
    status: number,
    error: string | null,
    extra?: Record<string, unknown>,
  ) {
    try {
      // Uložíme LEN prvých 12 znakov secretu ako fingerprint (nie plain text).
      // Rovnaké prefix na 2 riadkoch = rovnaký secret; rôzne prefixy = rôzne
      // secrety → user vidí či epoxidovo.sk posiela iný secret ako CRM čaká.
      const secretPrefix = providedSecretHeader
        ? providedSecretHeader.slice(0, 12) + "…"
        : "<empty>";
      await admin.from("webhook_audit_log").insert({
        source_id,
        endpoint: "/api/webhook/lead/[source_id]",
        method: "POST",
        status,
        ip,
        user_agent: ua,
        headers: {
          "content-type": request.headers.get("content-type"),
          "content-length": request.headers.get("content-length"),
          "x-webhook-secret-prefix": secretPrefix,
          "x-webhook-secret-len": providedSecretHeader.length,
          origin: request.headers.get("origin"),
          referer: request.headers.get("referer"),
          ...extra,
        },
        body_preview: bodyPreview,
        error,
      });
    } catch (auditErr) {
      console.warn("[webhook audit] failed to log:", auditErr);
    }
  }

  if (!source_id) {
    await audit(400, "missing source_id");
    return NextResponse.json(
      { ok: false, error: "Missing source_id in URL" },
      { status: 400 },
    );
  }

  // 1. Validate source exists + active
  const { data: source, error: sourceError } = await admin
    .from("lead_sources")
    .select("id, type, active, webhook_secret")
    .eq("id", source_id)
    .maybeSingle();

  if (sourceError) {
    console.error("[webhook] source lookup failed:", sourceError.message);
    await audit(500, "source_lookup_failed: " + sourceError.message);
    return NextResponse.json(
      { ok: false, error: "Source lookup failed" },
      { status: 500 },
    );
  }
  if (!source) {
    await audit(404, "unknown_source_id");
    return NextResponse.json(
      { ok: false, error: "Unknown source_id" },
      { status: 404 },
    );
  }
  if (!source.active) {
    await audit(403, "source_inactive");
    return NextResponse.json(
      { ok: false, error: "Source is inactive" },
      { status: 403 },
    );
  }

  // 2. Validate webhook secret (constant-time compare proti timing attacks)
  if (source.webhook_secret) {
    if (!constantTimeEqual(providedSecretHeader, source.webhook_secret)) {
      console.warn("[webhook] secret mismatch for", source_id);
      await audit(401, "secret_mismatch", {
        "expected-secret-prefix": source.webhook_secret.slice(0, 12) + "…",
        "expected-secret-len": source.webhook_secret.length,
      });
      return NextResponse.json(
        { ok: false, error: "Invalid X-Webhook-Secret header" },
        { status: 401 },
      );
    }
  }
  // Auth OK — success case log-neme dolu po insertu, aby sme vedeli aj lead_id.

  // 3. Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = LeadWebhookInputSchema.safeParse(body);
  if (!parsed.success) {
    await audit(400, "validation_failed", {
      "zod-errors": parsed.error.flatten(),
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Validation failed",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 3b. Dedupe check — ak už existuje lead s rovnakým phone+source_id v
  // posledných 7 dňoch, vráť OK bez insertu. Bráni duplikátom pri Zapier
  // reruns / retries / historical backfill z Facebook Lead Ads.
  if (input.phone) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("leads")
      .select("id, name, created_at")
      .eq("source_id", source.id)
      .eq("phone", input.phone)
      .gte("created_at", sevenDaysAgo)
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(
        `[webhook] DUPLICATE — phone ${input.phone} already exists as lead ${existing[0].id}, skipping insert`,
      );
      await audit(200, "duplicate_skipped", {
        "existing-lead-id": existing[0].id,
      });
      return NextResponse.json({
        ok: true,
        duplicate: true,
        existing_lead_id: existing[0].id,
        message: "Lead s rovnakým telefónom už existuje za posledných 7 dní",
      });
    }
  }

  // 4. Insert lead (admin client → bypassuje RLS)
  // sla_deadline a created activity sa nastavia v DB triggeroch
  const { data: lead, error: insertError } = await admin
    .from("leads")
    .insert({
      source_id: source.id,
      source_type: source.type,
      source_campaign: input.source_campaign ?? null,
      name: input.name.trim(),
      phone: input.phone || null,
      email: input.email?.toLowerCase() || null,
      data: input.data ?? {},
      priority: input.priority ?? "medium",
      value_estimate: input.value_estimate ?? null,
      status: "new",
    })
    .select("id, name, sla_deadline")
    .single();

  if (insertError || !lead) {
    console.error("[webhook] insert failed:", insertError);
    await audit(500, "insert_failed: " + (insertError?.message ?? "unknown"));
    return NextResponse.json(
      { ok: false, error: "DB insert failed", details: insertError?.message },
      { status: 500 },
    );
  }

  console.log(
    `[webhook] new lead ${lead.id} (${lead.name}) — SLA deadline:`,
    lead.sla_deadline,
  );
  await audit(201, null, { "new-lead-id": lead.id });

  return NextResponse.json(
    {
      ok: true,
      lead_id: lead.id,
      sla_deadline: lead.sla_deadline,
    },
    { status: 201 },
  );
}
