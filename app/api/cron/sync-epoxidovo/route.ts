// Edge runtime — @neondatabase/serverless používa fetch, CF Workers compatible.
export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/sync-epoxidovo — periodická sync leadov z epoxidovo.sk
 *
 * Pull-uje nové Lead rows z epoxidovo.sk Neon Postgres cez EPX_DATABASE_URL,
 * pre každý ktorý ešte nie je v bdsmanager (matchujeme cez `data.epx_id`),
 * insertne do `leads` s auto-assign trigger.
 *
 * Auth: header `X-Cron-Secret` musí sedieť s CRON_SECRET env var.
 * Spúšťa sa cez Cloudflare Cron Triggers alebo externý cron.
 *
 * Idempotent — safe re-run. Ak sa lead už insertol, preskočí ho.
 *
 * ⚠️ Pre production treba:
 *   - EPX_DATABASE_URL (Neon connection string epoxidovo.sk)
 *   - CRON_SECRET (random string, ten istý ako v cron scheduleri)
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

interface EpxLead {
  id: string;
  createdAt: Date;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  spaceType: string | null;
  service: string | null;
  area: number | null;
  termin: string | null;
  message: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  status: string | null;
}

/**
 * Termin mapping — musí ZLADIŤ s tým čo web (epoxidovo.sk) a Meta Lead Form
 * skutočne posielajú.
 *
 * Web dropdown (epoxidovo.sk) posiela hodnoty:
 *   • "Čo najskôr"
 *   • "Do 1 mesiaca"
 *   • "Do 3 mesiacov"
 *   • "Do 6 mesiacov"
 *   • "Zatiaľ len zisťujem informácie"
 *
 * Meta Lead Ads Form musí mať IDENTICKÝ zoznam (v Meta Ads Manager
 * pri custom question). Tie isté texty sa použijú v Zapier mappingu.
 *
 * Ak by web posielal aj value= atribúty (kľúče typu "co-najskor"),
 * pridali sme aj fallbacky. Legacy staré leady s inými kľúčmi tiež
 * mapujeme na najbližší nový termín.
 */
const TERMIN_LABELS: Record<string, string> = {
  // Priame LABEL z webu / Meta (kanonické texty)
  "Čo najskôr": "Čo najskôr",
  "Do 1 mesiaca": "Do 1 mesiaca",
  "Do 3 mesiacov": "Do 3 mesiacov",
  "Do 6 mesiacov": "Do 6 mesiacov",
  "Zatiaľ len zisťujem informácie": "Zatiaľ len zisťujem informácie",

  // Ak by web posielal value= atribúty (defenzívne mapovanie)
  "co-najskor": "Čo najskôr",
  "do-1-mesiaca": "Do 1 mesiaca",
  "do-3-mesiacov": "Do 3 mesiacov",
  "do-6-mesiacov": "Do 6 mesiacov",
  "zistujem-info": "Zatiaľ len zisťujem informácie",
  "zisťujem-info": "Zatiaľ len zisťujem informácie",

  // Legacy hodnoty (staré leady zo starých verzií webu)
  urgent: "Čo najskôr",
  "1-3-mesiacov": "Do 3 mesiacov",
  "3-6-mesiacov": "Do 6 mesiacov",
  "6-12-mesiacov": "Do 6 mesiacov",
  "zatial-info": "Zatiaľ len zisťujem informácie",
};

export async function POST(request: NextRequest) {
  // Auth
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET env not set" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!constantTimeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const epxUrl = process.env.EPX_DATABASE_URL;
  if (!epxUrl) {
    return NextResponse.json(
      { ok: false, error: "EPX_DATABASE_URL env not set" },
      { status: 503 },
    );
  }

  // @neondatabase/serverless — HTTP-based Postgres, CF Workers compatible
  const sql = neon(epxUrl);

  try {
    // Pull posledných 200 leadov z epoxidovo.sk. Explicitne cez sql.query()
    // — Next.js SWC/Terser môže mangleovať template literal syntax v
    // production build a Neon parser to nezachytí.
    const rows = (await sql.query(
      `SELECT id, "createdAt", name, email, phone, source, "spaceType", service,
             area, termin, message, "utmSource", "utmMedium", "utmCampaign", referrer, status
       FROM "Lead"
       ORDER BY "createdAt" DESC
       LIMIT 200`,
      [],
    )) as unknown as EpxLead[];

    const sb = createAdminClient();

    // Načítaj existujúce epx_id v CRM aby sme nedublikvali
    const { data: existing } = await sb
      .from("leads")
      .select("data")
      .not("data->epx_id", "is", null)
      .limit(500);
    const existingIds = new Set(
      (existing ?? [])
        .map((l) => (l.data as { epx_id?: string })?.epx_id)
        .filter(Boolean),
    );

    // Filter iba nové
    const toInsert = rows
      .filter((l) => !existingIds.has(l.id))
      .map((l) => {
        const areaValid = l.area && l.area > 0 && l.area < 20000 ? l.area : null;
        return {
          source_id: SOURCE_WEB_ID,
          source_type: "web_webhook",
          source_campaign:
            l.utmCampaign ||
            (l.source === "kontakt_message_form"
              ? "Kontakt (epoxidovo.sk)"
              : "Cenová ponuka (epoxidovo.sk)"),
          name: (l.name || "").trim() || "Bez mena",
          phone: l.phone || null,
          email: l.email ? l.email.toLowerCase() : null,
          priority: "medium",
          status: "new",
          created_at: new Date(l.createdAt).toISOString(),
          data: stripUndefined({
            epx_id: l.id,
            plocha: areaValid ? String(areaValid) : undefined,
            priestor: l.spaceType
              ? SPACE_LABELS[l.spaceType] || l.spaceType
              : undefined,
            typ_podlahy: l.service
              ? SERVICE_LABELS[l.service] || l.service
              : undefined,
            termin: l.termin
              ? TERMIN_LABELS[l.termin] || l.termin
              : undefined,
            message: l.message || undefined,
            utm_source: l.utmSource || undefined,
            utm_medium: l.utmMedium || undefined,
            utm_campaign: l.utmCampaign || undefined,
            referrer: l.referrer || undefined,
            _epx_source: l.source,
            _epx_status: l.status,
          }),
        };
      });

    if (toInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        checked: rows.length,
        new: 0,
        message: "Nothing to sync",
      });
    }

    const { data: inserted, error } = await sb
      .from("leads")
      .insert(toInsert)
      .select("id, name, created_at");

    if (error) {
      console.error("[cron/sync-epoxidovo] insert failed:", error);
      return NextResponse.json(
        { ok: false, error: "db_insert_failed" },
        { status: 500 },
      );
    }

    // Auto-assign každý nový lead aktívnemu obchodákovi (least-loaded).
    // User 2026-07-14: „nove leady co chodia nech su automaticky pridelovane
    // aktivnym". Non-fatal: ak assign zlyhá, lead ostane unassigned a admin
    // ho môže priradiť ručne.
    const { pickObchodakForNewLead, assignLeadToUser } = await import(
      "@/lib/lead-assignment"
    );
    let autoAssigned = 0;
    for (const lead of inserted ?? []) {
      try {
        const userId = await pickObchodakForNewLead(sb);
        if (userId) {
          const res = await assignLeadToUser(sb, lead.id, userId);
          if (res.ok) autoAssigned++;
        }
      } catch (e) {
        console.warn("[cron/sync-epoxidovo] auto-assign failed for", lead.id, e);
      }
    }

    return NextResponse.json({
      ok: true,
      checked: rows.length,
      new: inserted?.length ?? 0,
      auto_assigned: autoAssigned,
      leads:
        inserted?.map((l) => ({ id: l.id, name: l.name, created_at: l.created_at })) ??
        [],
    });
  } catch (err) {
    console.error("[cron/sync-epoxidovo] error:", err);
    // Debug — vraciame message v response len ak DEBUG_CRON=1 env
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: "sync_failed",
        detail: process.env.DEBUG_CRON === "1" ? detail : undefined,
      },
      { status: 500 },
    );
  }
}

// Alternatívne GET (pre debug / manuálne spúšťanie z browsera, ale stále vyžaduje secret)
export const GET = POST;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
