export const runtime = "edge";

import { NextResponse } from "next/server";
import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/meta-backfill
 *
 * Body: { leadgen_ids: string[] }  — pole Meta leadgen ID (bez prefixu "l:")
 *
 * Pre každý ID:
 *   1. Fetch cez Graph API /v22.0/{leadgen_id}?fields=id,created_time,form_id,field_data,ad_id,campaign_id,campaign_name
 *   2. Dedupe podľa meta_lead_id
 *   3. Insert do public.leads (source_type=facebook/instagram)
 *
 * Auth: admin (cookie) alebo x-dev-access-token header.
 */
export async function POST(request: Request) {
  const provided = request.headers.get("x-dev-access-token")?.trim();
  const required = process.env.DEV_ACCESS_TOKEN?.trim();
  const tokenBypass = !!(provided && required && provided === required);

  if (!tokenBypass) {
    const me = await getCurrentAppUser();
    if (!me) return NextResponse.json({ ok: false, error: "unauth" }, { status: 401 });
    const role = await getRealUserRole();
    if (role !== "admin")
      return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "meta_token_missing" }, { status: 503 });
  }

  let body: { leadgen_ids?: string[]; source_id?: string };
  try {
    body = (await request.json()) as { leadgen_ids?: string[]; source_id?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const ids = (body.leadgen_ids ?? [])
    .map((x) => String(x).replace(/^l:/, "").trim())
    .filter((x) => x && /^\d+$/.test(x));

  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "no_ids" }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json(
      { ok: false, error: "too_many_ids (max 500 per call)" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  // Default Facebook source ID pre insert; ak IG detekujeme z ad_id niekedy, upravíme
  const FB_SOURCE_ID = "22222222-2222-2222-2222-222222222222";
  const IG_SOURCE_ID = "33333333-3333-3333-3333-333333333333";

  // Fetch existujúce meta_lead_id → skip duplikátov
  const { data: existing } = await sb
    .from("leads")
    .select("data")
    .in("source_type", ["facebook", "instagram"])
    .not("data->meta_lead_id", "is", null);
  const existingSet = new Set<string>();
  for (const e of existing ?? []) {
    const mid = (e.data as { meta_lead_id?: string })?.meta_lead_id;
    if (mid) existingSet.add(String(mid));
  }

  const results: Array<{
    id: string;
    status: "inserted" | "duplicate" | "error" | "not_found";
    error?: string;
    name?: string;
  }> = [];

  const toInsert: Record<string, unknown>[] = [];

  for (const id of ids) {
    if (existingSet.has(id)) {
      results.push({ id, status: "duplicate" });
      continue;
    }

    try {
      const url = `https://graph.facebook.com/v22.0/${id}?fields=id,created_time,form_id,field_data,ad_id,campaign_id,campaign_name,platform,is_organic&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        id?: string;
        created_time?: string;
        form_id?: string;
        field_data?: Array<{ name: string; values: string[] }>;
        ad_id?: string;
        campaign_id?: string;
        campaign_name?: string;
        platform?: string;
        is_organic?: boolean;
        error?: { message: string };
      };

      if (data.error) {
        results.push({ id, status: "not_found", error: data.error.message });
        continue;
      }

      const fieldMap: Record<string, string> = {};
      for (const f of data.field_data ?? []) {
        fieldMap[f.name] = (f.values ?? []).join(", ");
      }
      const name =
        fieldMap.full_name ??
        fieldMap.name ??
        [fieldMap.first_name, fieldMap.last_name].filter(Boolean).join(" ") ??
        "(bez mena)";
      const phone = fieldMap.phone_number ?? fieldMap.phone ?? null;
      const email = fieldMap.email ?? null;

      // FB vs IG — platform field ak je, inak default FB
      const platform = (data.platform ?? "").toLowerCase();
      const isIg = platform === "ig" || platform === "instagram";
      const source_id = isIg ? IG_SOURCE_ID : FB_SOURCE_ID;
      const source_type = isIg ? "instagram" : "facebook";

      toInsert.push({
        source_id,
        source_type,
        source_campaign: data.campaign_name ?? null,
        name,
        phone,
        email,
        data: {
          meta_lead_id: data.id,
          meta_form_id: data.form_id,
          meta_ad_id: data.ad_id,
          meta_campaign_id: data.campaign_id,
          meta_campaign_name: data.campaign_name,
          meta_created_time: data.created_time,
          field_data: fieldMap,
          backfilled: true,
        },
        created_at: data.created_time ?? new Date().toISOString(),
      });

      results.push({ id, status: "inserted", name });
    } catch (e) {
      results.push({ id, status: "error", error: (e as Error).message });
    }
  }

  // Bulk insert
  let inserted = 0;
  if (toInsert.length > 0) {
    const { data: ins, error } = await sb
      .from("leads")
      .insert(toInsert)
      .select("id");
    if (error) {
      return NextResponse.json({
        ok: false,
        error: "insert_failed: " + error.message,
        results,
      });
    }
    inserted = ins?.length ?? 0;
  }

  const summary = {
    total: ids.length,
    inserted,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error" || r.status === "not_found").length,
  };

  return NextResponse.json({ ok: true, summary, results });
}
