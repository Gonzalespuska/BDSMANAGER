export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Meta (Facebook + Instagram) Lead Ads webhook.
 *
 * Two flows:
 *
 * GET /api/webhook/meta-leads?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 *   → Meta verify handshake. Vrátime hub.challenge ak verify_token sedí.
 *
 * POST /api/webhook/meta-leads
 *   → Meta posiela ID nového leadu. Stiahneme detaily z Graph API,
 *     mapujeme polia, insertneme do `leads` cez source pre FB/IG.
 *
 * Required env (Cloudflare Pages):
 *   META_WEBHOOK_VERIFY_TOKEN     — náhodný string, ten istý ako v Meta Dashboard
 *   META_PAGE_ACCESS_TOKEN        — long-lived Page Access Token (z Graph Explorer / Business Suite)
 *
 * Source UUIDs sú pevne dané v supabase/03_seed_sources.sql:
 *   FB:  22222222-2222-2222-2222-222222222222
 *   IG:  33333333-3333-3333-3333-333333333333
 *
 * Setup steps (Meta Developer Dashboard → My Apps → Your App):
 *   1. Webhooks → Page → Subscribe to `leadgen` field
 *   2. Callback URL: https://bdsmanager.pages.dev/api/webhook/meta-leads
 *   3. Verify Token: same as META_WEBHOOK_VERIFY_TOKEN env
 *   4. Pridaj Page do app cez Page Access Token v Graph API Explorer
 */

const META_GRAPH_VERSION = "v22.0";

const SOURCE_BY_PLATFORM: Record<string, { id: string; label: string }> = {
  facebook: {
    id: "22222222-2222-2222-2222-222222222222",
    label: "Facebook Lead Ads",
  },
  instagram: {
    id: "33333333-3333-3333-3333-333333333333",
    label: "Instagram Lead Ads",
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * GET — Meta webhook verify handshake
 * ──────────────────────────────────────────────────────────────────────── */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    console.error("[meta-webhook] META_WEBHOOK_VERIFY_TOKEN env not set");
    return NextResponse.json(
      { ok: false, error: "verify_token_not_configured" },
      { status: 503 },
    );
  }

  if (mode === "subscribe" && token === expected && challenge) {
    console.log("[meta-webhook] verify OK");
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.warn("[meta-webhook] verify failed — mode/token mismatch");
  return NextResponse.json(
    { ok: false, error: "verify_failed" },
    { status: 403 },
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * POST — leadgen notification
 *
 * Body format (Meta):
 *   {
 *     "object": "page",
 *     "entry": [{
 *       "id": "<page_id>",
 *       "time": 1234567890,
 *       "changes": [{
 *         "value": {
 *           "leadgen_id": "...",
 *           "page_id": "...",
 *           "form_id": "...",
 *           "adgroup_id": "...",
 *           "ad_id": "...",
 *           "created_time": 1234567890
 *         },
 *         "field": "leadgen"
 *       }]
 *     }]
 *   }
 * ──────────────────────────────────────────────────────────────────────── */
export async function POST(request: NextRequest) {
  const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken) {
    console.error("[meta-webhook] META_PAGE_ACCESS_TOKEN not set");
    return NextResponse.json(
      { ok: false, error: "page_token_not_configured" },
      { status: 503 },
    );
  }

  // ─── Validate Meta HMAC signature ────────────────────────────────────
  // Meta posiela X-Hub-Signature-256: sha256=<hmac>. Bez overenia by ktokoľvek
  // mohol POSTnúť fake leadgen_id na endpoint a triggernuť Graph API fetch.
  // Ak META_APP_SECRET nie je nastavený, log warning ale neblokujeme (pretože
  // verify token + page token sú samé o sebe primárna obrana). V budúcnosti
  // by sme to mali zmeniť na hard fail.
  const rawBody = await request.text();
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
    const expected = await computeMetaSignature(rawBody, appSecret);
    if (!constantTimeEqual(sigHeader, `sha256=${expected}`)) {
      console.warn("[meta-webhook] HMAC signature mismatch");
      return NextResponse.json(
        { ok: false, error: "invalid_signature" },
        { status: 401 },
      );
    }
  } else {
    console.warn(
      "[meta-webhook] META_APP_SECRET not set — accepting webhook without HMAC verification (less secure!)",
    );
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBody) as MetaWebhookBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (body.object !== "page" || !Array.isArray(body.entry)) {
    return NextResponse.json(
      { ok: false, error: "unexpected_payload_shape" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const results: Array<{ leadgen_id: string; ok: boolean; reason?: string }> =
    [];

  for (const entry of body.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
      const { leadgen_id, ad_id, form_id, created_time } = change.value;

      try {
        const fetched = await fetchLeadFromGraph(leadgen_id, pageAccessToken);
        if (!fetched) {
          results.push({
            leadgen_id,
            ok: false,
            reason: "graph_fetch_failed",
          });
          continue;
        }

        // Map field_data array (FB) to flat dict
        const fields: Record<string, string> = {};
        for (const f of fetched.field_data ?? []) {
          if (f.name && Array.isArray(f.values) && f.values[0]) {
            fields[f.name.toLowerCase()] = f.values[0];
          }
        }

        const name =
          pick(fields, [
            "full_name",
            "first_name",
            "name",
            "meno",
            "meno_a_priezvisko",
          ]) || "Bez mena";
        const email = pick(fields, ["email", "e-mail"]);
        const phone = pick(fields, [
          "phone_number",
          "telefon",
          "telefonne_cislo",
          "phone",
        ]);

        if (!email && !phone) {
          results.push({
            leadgen_id,
            ok: false,
            reason: "no_contact_method",
          });
          continue;
        }

        // Heuristic: Instagram → platform = "ig" v leadgen response (ak FB to vracia)
        // Bezpečný default: facebook. Adjustnutelné cez payload.
        const platform = (fetched.platform ?? "facebook").toLowerCase();
        const sourceMeta =
          SOURCE_BY_PLATFORM[platform] ?? SOURCE_BY_PLATFORM.facebook;

        // Normalizuj Meta form field-y na štandardné kľúče (priestor, plocha, ...)
        // aby ich lead card mohla zobraziť rovnako ako web leady
        const normalized = normalizeMetaFields(fields);

        const { data: insertedLead, error: insertError } = await admin
          .from("leads")
          .insert({
            source_id: sourceMeta.id,
            source_type: platform === "instagram" ? "instagram" : "facebook",
            source_campaign: fetched.campaign_name ?? sourceMeta.label,
            name,
            phone: phone || null,
            email: email?.toLowerCase() || null,
            priority: "medium",
            status: "new",
            data: {
              // Normalizované štandardné kľúče majú prednosť
              ...normalized,
              // Raw fields pre debug / originálne meta hodnoty
              ...fields,
              // A prepíš znovu normalizované na koniec — nesmú byť overriden
              ...normalized,
              meta_leadgen_id: leadgen_id,
              meta_form_id: form_id,
              meta_ad_id: ad_id,
              meta_created_time: created_time,
              meta_campaign_id: fetched.campaign_id,
              meta_campaign_name: fetched.campaign_name,
              meta_adset_id: fetched.adset_id,
              meta_adset_name: fetched.adset_name,
              meta_ad_name: fetched.ad_name,
              meta_platform: platform,
            },
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("[meta-webhook] insert failed:", insertError);
          results.push({
            leadgen_id,
            ok: false,
            reason: `db_insert: ${insertError.message}`,
          });
        } else {
          // Auto-assign new Meta lead k aktívnemu obchodákovi.
          // User 2026-07-14: „nove leady co chodia nech su automaticky
          // pridelovane aktivnym".
          try {
            const { pickObchodakForNewLead, assignLeadToUser } = await import(
              "@/lib/lead-assignment"
            );
            const userId = await pickObchodakForNewLead(admin);
            if (userId && insertedLead) {
              await assignLeadToUser(admin, insertedLead.id, userId);
            }
          } catch (e) {
            console.warn("[meta-webhook] auto-assign failed:", e);
          }
          results.push({ leadgen_id, ok: true });
        }
      } catch (err) {
        console.error("[meta-webhook] processing error:", err);
        results.push({
          leadgen_id,
          ok: false,
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }

  // Meta očakáva 200 — inak bude retry-ovať. Vrátime aj summary v body pre dev.
  return NextResponse.json({ ok: true, processed: results });
}

/* ────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * HMAC-SHA256 cez Web Crypto API (edge runtime compatible).
 * Vracia hex string.
 */
async function computeMetaSignature(
  body: string,
  secret: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time compare proti timing attacks.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function fetchLeadFromGraph(
  leadgenId: string,
  accessToken: string,
): Promise<GraphLeadResponse | null> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${leadgenId}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set(
    "fields",
    "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform",
  );

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    console.error(
      "[meta-webhook] Graph fetch failed:",
      res.status,
      await res.text().catch(() => ""),
    );
    return null;
  }
  return (await res.json()) as GraphLeadResponse;
}

function pick(
  obj: Record<string, string>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Meta lead form field names sú často naformátované s emoji / underscore
 * (napr. "👉_typ_priestoru", "📐_30_–_60_m²"). Táto funkcia:
 *   1. Pattern-matchne kľúč a extrahuje surovú hodnotu
 *   2. Očistí emoji/underscore, prevedie na štandardný string
 *   3. Vráti štandardné kľúče: plocha, priestor, lokalita, typ_podlahy, termin
 */
function normalizeMetaFields(fields: Record<string, string>): {
  plocha?: string;
  priestor?: string;
  lokalita?: string;
  typ_podlahy?: string;
  termin?: string;
} {
  const out: {
    plocha?: string;
    priestor?: string;
    lokalita?: string;
    typ_podlahy?: string;
    termin?: string;
  } = {};

  // Helper — odstráni emoji + underscore + trim
  const clean = (s: string): string =>
    s
      .replace(/[👉🏠📐🔧🎨💰📅⚡🎯🔍🏢🏭🚗🛠️]/gu, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Helper — vytiahne prvé číslo z reťazca (pre plochu)
  const extractNumber = (s: string): string | undefined => {
    // "30 – 60 m²" → priemer 45. "300 m²" → 300. "45m2" → 45.
    const range = s.match(/(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)/);
    if (range) {
      const a = parseFloat(range[1].replace(",", "."));
      const b = parseFloat(range[2].replace(",", "."));
      return String(Math.round((a + b) / 2));
    }
    const single = s.match(/(\d+(?:[.,]\d+)?)/);
    return single ? single[1].replace(",", ".") : undefined;
  };

  for (const [rawKey, rawVal] of Object.entries(fields)) {
    if (!rawVal || !rawVal.trim()) continue;
    const key = clean(rawKey).toLowerCase();
    const val = clean(rawVal);

    if (!out.plocha && (key.includes("rozloh") || key.includes("plocha") || key.includes("m²") || key.includes("m2"))) {
      const n = extractNumber(rawVal) ?? extractNumber(val);
      if (n) out.plocha = n;
    }
    if (!out.priestor && (key.includes("priestor") || key.includes("typ priestoru") || key.includes("kde"))) {
      out.priestor = val;
    }
    if (!out.lokalita && (key.includes("lokalita") || key.includes("mesto") || key.includes("kraj") || key.includes("city"))) {
      out.lokalita = val;
    }
    if (!out.typ_podlahy && (key.includes("typ podlahy") || key.includes("povrch") || key.includes("material"))) {
      out.typ_podlahy = val;
    }
    if (!out.termin && (key.includes("termin") || key.includes("kedy") || key.includes("do koľkých"))) {
      out.termin = val;
    }
  }

  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────── */

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: {
        leadgen_id?: string;
        page_id?: string;
        form_id?: string;
        adgroup_id?: string;
        ad_id?: string;
        created_time?: number;
      };
    }>;
  }>;
}

interface GraphLeadResponse {
  id?: string;
  created_time?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  platform?: string;
}
