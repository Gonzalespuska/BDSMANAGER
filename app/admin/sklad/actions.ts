"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * Server actions pre /admin/sklad — pridávanie / úprava / mazanie skladu.
 */

export async function addStockAction(input: {
  sap_number: string | null;
  product_name: string;
  brand: string;
  package_size_kg: number | null;
  package_unit: string;
  quantity_packages: number;
  min_alert_qty: number;
  location: string | null;
  notes: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await getCurrentAppUser();
  if (!me || me.role !== "admin")
    return { ok: false, error: "unauthorized" };
  if (!input.product_name?.trim())
    return { ok: false, error: "missing_product_name" };
  if (input.quantity_packages < 0)
    return { ok: false, error: "negative_qty" };

  const sb = createAdminClient();

  // Upsert — ak už existuje SAP + veľkosť, PRIRÁTAME
  let existing: { id: string; quantity_packages: number } | null = null;
  if (input.sap_number) {
    const { data } = await sb
      .from("inventory_stock")
      .select("id, quantity_packages")
      .eq("sap_number", input.sap_number)
      .eq("package_size_kg", input.package_size_kg)
      .eq("package_unit", input.package_unit)
      .maybeSingle();
    existing = data ?? null;
  } else {
    const { data } = await sb
      .from("inventory_stock")
      .select("id, quantity_packages")
      .eq("product_name", input.product_name)
      .eq("brand", input.brand)
      .eq("package_size_kg", input.package_size_kg)
      .eq("package_unit", input.package_unit)
      .maybeSingle();
    existing = data ?? null;
  }

  if (existing) {
    // Prirátame na existujúci sklad
    const newQty = existing.quantity_packages + input.quantity_packages;
    const { error: upErr } = await sb
      .from("inventory_stock")
      .update({
        quantity_packages: newQty,
        min_alert_qty: input.min_alert_qty || undefined,
        location: input.location || undefined,
        notes: input.notes || undefined,
      })
      .eq("id", existing.id);
    if (upErr) return { ok: false, error: upErr.message };

    await sb.from("inventory_movements").insert({
      stock_id: existing.id,
      product_name: input.product_name,
      brand: input.brand,
      package_size_kg: input.package_size_kg,
      package_unit: input.package_unit,
      delta: input.quantity_packages,
      reason: "manual_add",
      actor_id: me.id,
      notes: input.notes,
    });

    revalidatePath("/admin/sklad");
    revalidatePath("/admin");
    return { ok: true, id: existing.id };
  }

  const { data: created, error: insErr } = await sb
    .from("inventory_stock")
    .insert({
      sap_number: input.sap_number,
      product_name: input.product_name,
      brand: input.brand,
      package_size_kg: input.package_size_kg,
      package_unit: input.package_unit,
      quantity_packages: input.quantity_packages,
      min_alert_qty: input.min_alert_qty,
      location: input.location,
      notes: input.notes,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (insErr || !created)
    return { ok: false, error: insErr?.message ?? "insert_failed" };

  await sb.from("inventory_movements").insert({
    stock_id: created.id,
    product_name: input.product_name,
    brand: input.brand,
    package_size_kg: input.package_size_kg,
    package_unit: input.package_unit,
    delta: input.quantity_packages,
    reason: "manual_add",
    actor_id: me.id,
    notes: input.notes,
  });

  revalidatePath("/admin/sklad");
  revalidatePath("/admin");
  return { ok: true, id: created.id };
}

export async function adjustStockAction(input: {
  stock_id: string;
  delta: number;
  reason: "adjustment" | "loss" | "manual_add";
  notes: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentAppUser();
  if (!me || me.role !== "admin")
    return { ok: false, error: "unauthorized" };
  if (input.delta === 0) return { ok: false, error: "zero_delta" };

  const sb = createAdminClient();
  const { data: stock, error: getErr } = await sb
    .from("inventory_stock")
    .select("quantity_packages, product_name, brand, package_size_kg, package_unit")
    .eq("id", input.stock_id)
    .maybeSingle();
  if (getErr || !stock) return { ok: false, error: "stock_not_found" };

  const newQty = stock.quantity_packages + input.delta;
  if (newQty < 0)
    return { ok: false, error: "insufficient_stock" };

  const { error: upErr } = await sb
    .from("inventory_stock")
    .update({ quantity_packages: newQty })
    .eq("id", input.stock_id);
  if (upErr) return { ok: false, error: upErr.message };

  await sb.from("inventory_movements").insert({
    stock_id: input.stock_id,
    product_name: stock.product_name,
    brand: stock.brand,
    package_size_kg: stock.package_size_kg,
    package_unit: stock.package_unit,
    delta: input.delta,
    reason: input.reason,
    actor_id: me.id,
    notes: input.notes,
  });

  revalidatePath("/admin/sklad");
  return { ok: true };
}

export async function deleteStockAction(
  stockId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentAppUser();
  if (!me || me.role !== "admin")
    return { ok: false, error: "unauthorized" };
  const sb = createAdminClient();
  const { error } = await sb
    .from("inventory_stock")
    .delete()
    .eq("id", stockId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sklad");
  return { ok: true };
}
