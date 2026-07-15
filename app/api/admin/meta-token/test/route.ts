export const runtime = "edge";

import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/meta-token/test
 *
 * Skontroluje uložený Meta token — vráti user-friendly diagnostiku:
 *   • Token valid?
 *   • Ma Page assignment?
 *   • Ma leads_retrieval permission?
 *   • Koľko lead forms videí?
 *
 * User klikne „Otestovať" po Uložiť → vidí konkrétnu chybu.
 */
export async function POST() {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("secure_config")
    .select("key, value")
    .in("key", ["META_PAGE_ACCESS_TOKEN", "META_PAGE_IDS"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = map.get("META_PAGE_ACCESS_TOKEN");
  const pageIdsRaw = map.get("META_PAGE_IDS") ?? "";
  if (!token || !pageIdsRaw) {
    return NextResponse.json({
      ok: false,
      step: "config",
      message: "Token alebo Page IDs chýba. Ulož ich najprv.",
    });
  }
  const pageIds = pageIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const results: Array<{
    page_id: string;
    page_name: string | null;
    accessible: boolean;
    lead_forms_count: number;
    error: string | null;
  }> = [];

  for (const pid of pageIds) {
    // 1) Page name — základný check že token má prístup
    const nameRes = await fetch(
      `https://graph.facebook.com/v22.0/${pid}?fields=name&access_token=${encodeURIComponent(token)}`,
    );
    const nameJ = (await nameRes.json()) as {
      name?: string;
      error?: { message?: string };
    };
    if (!nameRes.ok || nameJ.error) {
      results.push({
        page_id: pid,
        page_name: null,
        accessible: false,
        lead_forms_count: 0,
        error: nameJ.error?.message ?? `HTTP ${nameRes.status}`,
      });
      continue;
    }
    // 2) leadgen_forms — dôležitý test
    const formsRes = await fetch(
      `https://graph.facebook.com/v22.0/${pid}/leadgen_forms?fields=id,name,status&limit=5&access_token=${encodeURIComponent(token)}`,
    );
    const formsJ = (await formsRes.json()) as {
      data?: Array<{ id: string }>;
      error?: { message?: string };
    };
    if (!formsRes.ok || formsJ.error) {
      results.push({
        page_id: pid,
        page_name: nameJ.name ?? pid,
        accessible: true,
        lead_forms_count: 0,
        error:
          `Chýba 'leads_retrieval' permission. ${formsJ.error?.message ?? `HTTP ${formsRes.status}`}`,
      });
      continue;
    }
    results.push({
      page_id: pid,
      page_name: nameJ.name ?? pid,
      accessible: true,
      lead_forms_count: (formsJ.data ?? []).length,
      error: null,
    });
  }

  const allOk = results.every((r) => r.accessible && r.error === null);
  return NextResponse.json({
    ok: allOk,
    results,
    fix: allOk
      ? null
      : "V Meta Business Manager: System Users → BDSMANAGER → Generate token → zaškrtni všetky permissions vrátane 'leads_retrieval' a 'ads_management' → Expiration: Never → paste nový token sem.",
  });
}
