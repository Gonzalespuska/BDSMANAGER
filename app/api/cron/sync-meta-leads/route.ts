export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/sync-meta-leads
 *
 * Poll Facebook/Instagram Lead Ads cez Marketing API každých 5 min.
 * NETREBA leads_retrieval webhook permission — používame ads_read
 * ktorý má Standard access (žiadny App Review).
 *
 * Auto-discovery flow:
 *   1. GET /me/accounts → zoznam FB Pages s access
 *   2. Pre každú Page: GET /{page_id}/leadgen_forms → forms
 *   3. Pre každú form: GET /{form_id}/leads?since={last_sync} → nové leady
 *   4. Deduplikuj cez data.meta_leadgen_id, insert do CRM
 *   5. Auto-assign trigger → obchodník
 *
 * Env vars (CF Pages secrets):
 *   CRON_SECRET — auth
 *   META_PAGE_ACCESS_TOKEN — long-lived Page Access Token
 *
 * Meta Graph API version: v22.0
 */
const META_GRAPH_VERSION = "v22.0";
const SOURCE_FB = "22222222-2222-2222-2222-222222222222";
const SOURCE_IG = "33333333-3333-3333-3333-333333333333";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

interface MetaFormLead {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  platform?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
}

interface DiscoveredForm {
  page_id: string;
  page_name: string;
  form_id: string;
  form_name: string;
}

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!constantTimeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageToken) {
    return NextResponse.json(
      { ok: false, error: "META_PAGE_ACCESS_TOKEN not set" },
      { status: 503 },
    );
  }

  const sb = createAdminClient();
  const results: {
    forms_discovered: number;
    leads_checked: number;
    leads_new: number;
    errors: string[];
  } = { forms_discovered: 0, leads_checked: 0, leads_new: 0, errors: [] };

  try {
    // 1) Discover pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?access_token=${pageToken}`,
    );
    if (!pagesRes.ok) {
      const text = await pagesRes.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "graph_me_accounts_failed", detail: text.slice(0, 500) },
        { status: 500 },
      );
    }
    const pagesJson = (await pagesRes.json()) as {
      data?: Array<{ id: string; name: string; access_token?: string }>;
    };
    const pages = pagesJson.data ?? [];

    // 2) Discover forms per page
    const forms: DiscoveredForm[] = [];
    for (const page of pages) {
      const pageAccess = page.access_token ?? pageToken;
      const formsRes = await fetch(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${page.id}/leadgen_forms?access_token=${pageAccess}&fields=id,name`,
      );
      if (!formsRes.ok) {
        results.errors.push(`Forms fetch failed for page ${page.id}: HTTP ${formsRes.status}`);
        continue;
      }
      const formsJson = (await formsRes.json()) as {
        data?: Array<{ id: string; name?: string }>;
      };
      for (const f of formsJson.data ?? []) {
        forms.push({
          page_id: page.id,
          page_name: page.name,
          form_id: f.id,
          form_name: f.name ?? "Unnamed",
        });
      }
    }
    results.forms_discovered = forms.length;

    // 3) Pre každú form: fetch nedávnych leads (posledných 7 dní)
    const since = Math.floor((Date.now() - 7 * 86400_000) / 1000);
    const allLeads: Array<MetaFormLead & { _page_id: string; _form_id: string }> = [];
    for (const form of forms) {
      const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${form.form_id}/leads`);
      url.searchParams.set("access_token", pageToken);
      url.searchParams.set(
        "fields",
        "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform,field_data",
      );
      url.searchParams.set("filtering", JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: since }]));
      const leadsRes = await fetch(url.toString());
      if (!leadsRes.ok) {
        const text = await leadsRes.text().catch(() => "");
        results.errors.push(`Form ${form.form_id} leads fetch: HTTP ${leadsRes.status} ${text.slice(0, 200)}`);
        continue;
      }
      const leadsJson = (await leadsRes.json()) as { data?: MetaFormLead[] };
      for (const l of leadsJson.data ?? []) {
        allLeads.push({ ...l, _page_id: form.page_id, _form_id: form.form_id });
      }
    }
    results.leads_checked = allLeads.length;

    // 4) Filter proti duplikátom
    const { data: existing } = await sb
      .from("leads")
      .select("data")
      .not("data->meta_leadgen_id", "is", null)
      .limit(1000);
    const existingIds = new Set(
      (existing ?? []).map((l) => (l.data as { meta_leadgen_id?: string }).meta_leadgen_id).filter(Boolean),
    );

    const newLeads = allLeads.filter((l) => !existingIds.has(l.id));

    // 5) Map fields → insert do CRM
    const toInsert = newLeads.map((l) => {
      const fields: Record<string, string> = {};
      for (const f of l.field_data ?? []) {
        if (f.name && Array.isArray(f.values) && f.values[0]) {
          fields[f.name.toLowerCase()] = f.values[0];
        }
      }
      const name =
        pickField(fields, ["full_name", "first_name", "name", "meno", "meno_a_priezvisko"]) || "Bez mena";
      const email = pickField(fields, ["email", "e-mail"]);
      const phone = pickField(fields, ["phone_number", "telefon", "telefonne_cislo", "phone"]);
      const platform = (l.platform ?? "facebook").toLowerCase();
      const isIg = platform === "instagram";

      return {
        source_id: isIg ? SOURCE_IG : SOURCE_FB,
        source_type: isIg ? "instagram" : "facebook",
        source_campaign: l.campaign_name ?? (isIg ? "Instagram Lead Ads" : "Facebook Lead Ads"),
        name,
        phone: phone || null,
        email: email ? email.toLowerCase() : null,
        priority: "medium",
        status: "new",
        created_at: l.created_time,
        data: {
          ...fields,
          meta_leadgen_id: l.id,
          meta_form_id: l._form_id,
          meta_ad_id: l.ad_id,
          meta_ad_name: l.ad_name,
          meta_adset_id: l.adset_id,
          meta_adset_name: l.adset_name,
          meta_campaign_id: l.campaign_id,
          meta_campaign_name: l.campaign_name,
          meta_platform: platform,
          meta_page_id: l._page_id,
        },
      };
    });

    if (toInsert.length > 0) {
      const { data: inserted, error } = await sb.from("leads").insert(toInsert).select("id, name");
      if (error) {
        results.errors.push(`Insert error: ${error.message}`);
      } else {
        results.leads_new = inserted?.length ?? 0;
      }
    }

    return NextResponse.json({
      ok: true,
      ...results,
      pages_count: pages.length,
    });
  } catch (err) {
    console.error("[sync-meta-leads]", err);
    return NextResponse.json(
      { ok: false, error: "exception", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

// Alias GET pre debug/manual triggering
export const GET = POST;

function pickField(obj: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}
