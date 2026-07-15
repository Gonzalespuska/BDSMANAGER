export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/webhook/epoxidovo-push
 *
 * User 2026-07-15: „urob to najlepsie ako sa da s tym ze uz nikdy tento
 * problem nebude" — reakcia na 4-dňový sync outage (Adriána incident).
 *
 * Real-time PUSH namiesto pull cron (každých 5 min). Epoxidovo.sk pri
 * vytvorení leadu POSTne priamo sem s celým lead objektom. Nulový gap,
 * nezávisle od Neon DB schémy (posiela sa JSON, nie SQL query).
 *
 * Auth: header X-Epx-Secret == process.env.EPX_PUSH_SECRET
 *
 * Idempotent — ak lead s rovnakým epx_id už existuje, len 200 OK bez dupe.
 *
 * Body (celý payload):
 * {
 *   epx_id: string,           // Neon Lead.id
 *   created_at: string,       // ISO datetime
 *   name: string,
 *   email: string | null,
 *   phone: string | null,
 *   source: string,           // 'cenova_ponuka_form' / 'kontakt_message_form' / ...
 *   spaceType: string | null,
 *   service: string | null,
 *   area: number | null,
 *   message: string | null,
 *   utmSource?: string | null,
 *   utmMedium?: string | null,
 *   utmCampaign?: string | null,
 *   referrer?: string | null,
 * }
 */
const SOURCE_WEB_ID = "11111111-1111-1111-1111-111111111111";

const SPACE_LABELS: Record<string, string> = {
  dom: "Dom / byt",
  garaz: "Garáž",
  "hala-firma": "Hala / firma",
  ine: "Iné",
};

const SERVICE_LABELS: Record<string, string | null> = {
  jednofarebne: "Jednofarebná",
  chipsove: "Chipsová",
  mramorove: "Mramorová",
  metalicke: "Metalická",
  nezvolene: null,
};

function parseTerminFromMessage(message: string | null): string | null {
  if (!message) return null;
  const m = message.match(/Termín\s*:\s*([^\n\r]+)/i);
  return m ? m[1].trim() : null;
}

export async function POST(request: NextRequest) {
  const expected = process.env.EPX_PUSH_SECRET ?? "";
  const provided = request.headers.get("x-epx-secret") ?? "";
  if (!expected || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const epx_id = (body.epx_id ?? body.id) as string | undefined;
  if (!epx_id) {
    return NextResponse.json(
      { ok: false, error: "missing_epx_id" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  // Idempotency — ak už existuje, iba 200 OK. epx_id je v data->>epx_id.
  const { data: existingRow } = await sb
    .from("leads")
    .select("id")
    .eq("data->>epx_id", epx_id)
    .limit(1)
    .maybeSingle();
  if (existingRow) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      lead_id: existingRow.id,
    });
  }

  const area = typeof body.area === "number" ? body.area : Number(body.area);
  const areaValid = area && area > 0 && area < 20000 ? area : null;
  const spaceType = (body.spaceType as string) ?? null;
  const service = (body.service as string) ?? null;
  const message = (body.message as string | null) ?? null;
  const source = (body.source as string) ?? "web";
  const createdAt = (body.created_at ?? body.createdAt) as string | undefined;

  const insertPayload = {
    source_id: SOURCE_WEB_ID,
    source_type: "web_webhook",
    source_campaign:
      (body.utmCampaign as string | undefined) ??
      (source === "kontakt_message_form"
        ? "Kontakt (epoxidovo.sk)"
        : "Cenová ponuka (epoxidovo.sk)"),
    name: ((body.name as string | undefined) ?? "").trim() || "Bez mena",
    phone: (body.phone as string | undefined) ?? null,
    email: body.email ? String(body.email).toLowerCase() : null,
    priority: "medium",
    status: "new",
    created_at: createdAt ? new Date(createdAt).toISOString() : undefined,
    data: {
      epx_id,
      plocha: areaValid ? String(areaValid) : undefined,
      priestor: spaceType ? SPACE_LABELS[spaceType] || spaceType : undefined,
      typ_podlahy: service
        ? SERVICE_LABELS[service] || service
        : undefined,
      termin: parseTerminFromMessage(message) ?? undefined,
      message: message ?? undefined,
      utm_source: (body.utmSource as string | undefined) ?? undefined,
      utm_medium: (body.utmMedium as string | undefined) ?? undefined,
      utm_campaign: (body.utmCampaign as string | undefined) ?? undefined,
      referrer: (body.referrer as string | undefined) ?? undefined,
      _epx_source: source,
      _push_delivered_at: new Date().toISOString(),
    },
  };

  const { data: inserted, error } = await sb
    .from("leads")
    .insert(insertPayload)
    .select("id, name")
    .single();
  if (error) {
    return NextResponse.json(
      { ok: false, error: "insert_failed", message: error.message },
      { status: 500 },
    );
  }

  // Auto-assign — rovnaká logika ako v cron sync
  try {
    const { pickObchodakForNewLead, assignLeadToUser } = await import(
      "@/lib/lead-assignment"
    );
    const userId = await pickObchodakForNewLead(sb);
    if (userId) await assignLeadToUser(sb, inserted.id as string, userId);
  } catch (e) {
    console.warn("[epoxidovo-push] auto-assign failed:", e);
  }

  return NextResponse.json({ ok: true, lead_id: inserted.id });
}
