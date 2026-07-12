export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/lead/inventory-taken
 * Body: { lead_id }
 *
 * Realizator klikne "Zobral som materiál" — uložíme timestamp do
 * lead.data.realization_inventory_taken_at aby sme mohli neskôr audit-nuť
 * kto a kedy zobral, plus checkbox stav na UI (žlté → zelené).
 *
 * User 2026-07-11:
 *   "to vzal sa neda kliknut je to somarina, radsej to daj prec a iba
 *    submit button ze to zobral to potvrdi".
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "realizacie" && user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden_wrong_role" }, { status: 403 });
  }

  let body: { lead_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const leadId = body.lead_id;
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "missing_lead_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("data, realization_by")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  // Ownership check
  if (user.role !== "admin" && lead.realization_by !== user.id) {
    return NextResponse.json(
      { ok: false, error: "forbidden_not_your_realization" },
      { status: 403 },
    );
  }

  const nowIso = new Date().toISOString();
  const existing = (lead.data as Record<string, unknown> | null) ?? {};

  // Idempotencia — ak už bolo raz vzaté, nedávaj sklad druhýkrát preč.
  // Vrátíme existujúci timestamp a hotovo.
  if (typeof existing.realization_inventory_taken_at === "string") {
    return NextResponse.json({
      ok: true,
      taken_at: existing.realization_inventory_taken_at,
      already_taken: true,
    });
  }

  // ─── ODVOD ZO SKLADU ───────────────────────────────────────────────
  // User 2026-07-12: „ked potvrdim ze som zobral material musi to
  // automaticky zo skladu dat prec inventura".
  // Prejdeme kazdy item z lead.data.realization_inventory a zdec-nutíme
  // inventory_stock (match by sap_number alebo product_name).
  const inventory = Array.isArray(existing.realization_inventory)
    ? (existing.realization_inventory as Array<{
        sku?: string;
        label?: string;
        qty?: number;
        unit_size_kg?: number;
      }>)
    : [];

  const stockChanges: Array<{
    sku: string;
    label: string;
    qty: number;
    stock_before: number | null;
    stock_after: number | null;
    matched: boolean;
  }> = [];

  for (const item of inventory) {
    if (!item?.qty || item.qty <= 0) continue;
    const sku = item.sku ?? "";
    const label = item.label ?? "";
    let stockRow: {
      id: string;
      quantity_packages: number;
      product_name: string;
      brand: string | null;
      package_size_kg: number | null;
      package_unit: string;
    } | null = null;

    // 1. Match cez sap_number (najspoľahlivejšie)
    if (sku) {
      const { data } = await admin
        .from("inventory_stock")
        .select("id, quantity_packages, product_name, brand, package_size_kg, package_unit")
        .eq("sap_number", sku)
        .maybeSingle();
      if (data) stockRow = data;
    }
    // 2. Fallback — hľadaj podľa product_name (partial match ilike)
    if (!stockRow && label) {
      const { data } = await admin
        .from("inventory_stock")
        .select("id, quantity_packages, product_name, brand, package_size_kg, package_unit")
        .ilike("product_name", `%${label.split(" ")[0]}%`)
        .limit(1)
        .maybeSingle();
      if (data) stockRow = data;
    }

    if (!stockRow) {
      stockChanges.push({
        sku,
        label,
        qty: item.qty,
        stock_before: null,
        stock_after: null,
        matched: false,
      });
      continue;
    }

    const before = stockRow.quantity_packages;
    const after = Math.max(0, before - item.qty);
    const delta = -Math.min(before, item.qty); // záporne

    await admin
      .from("inventory_stock")
      .update({ quantity_packages: after })
      .eq("id", stockRow.id);

    // Audit movement (best-effort)
    admin
      .from("inventory_movements")
      .insert({
        stock_id: stockRow.id,
        product_name: stockRow.product_name,
        brand: stockRow.brand,
        package_size_kg: stockRow.package_size_kg,
        package_unit: stockRow.package_unit,
        delta,
        reason: "realizacia_vyber",
        lead_id: leadId,
        user_id: user.id,
        note: `Realizator vzal z Inventúra papiera`,
      })
      .then(() => {});

    stockChanges.push({
      sku,
      label,
      qty: item.qty,
      stock_before: before,
      stock_after: after,
      matched: true,
    });
  }

  // ─── ULOŽ TIMESTAMP DO LEAD ────────────────────────────────────────
  const nextData = {
    ...existing,
    realization_inventory_taken_at: nowIso,
    realization_inventory_taken_by: user.id,
    realization_inventory_stock_changes: stockChanges,
  };
  const { error } = await admin
    .from("leads")
    .update({ data: nextData, last_activity_at: nowIso })
    .eq("id", leadId);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `db_update: ${error.message}` },
      { status: 500 },
    );
  }

  // Audit
  admin
    .from("lead_activities")
    .insert({
      lead_id: leadId,
      user_id: user.id,
      type: "inventory_taken",
      data: { taken_at: nowIso, stock_changes: stockChanges },
    })
    .then(() => {});

  return NextResponse.json({
    ok: true,
    taken_at: nowIso,
    stock_changes: stockChanges,
    matched_count: stockChanges.filter((c) => c.matched).length,
    unmatched_count: stockChanges.filter((c) => !c.matched).length,
  });
}
