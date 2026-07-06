"use server";

import { redirect } from "next/navigation";
import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function assertAdmin() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");
  return me;
}

export interface OrderItem {
  sap_number: string;
  name: string;
  packaging: string;
  quantity: number;
}

/**
 * createOrderAction — nová objednávka materiálu.
 */
export async function createOrderAction(formData: FormData) {
  const me = await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const areaRaw = String(formData.get("area_m2") ?? "").trim();
  const area_m2 = areaRaw
    ? parseFloat(areaRaw.replace(",", ".")) || null
    : null;
  const supplier = String(formData.get("supplier") ?? "Sika").trim() || "Sika";
  const itemsJson = String(formData.get("items") ?? "[]");

  if (!title || title.length < 2) {
    redirect("/admin/objednavky?err=" + encodeURIComponent("Chýba názov objednávky"));
  }

  let items: OrderItem[];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    redirect("/admin/objednavky?err=" + encodeURIComponent("Neplatný formát položiek"));
  }
  if (!Array.isArray(items!) || items!.length === 0) {
    redirect("/admin/objednavky?err=" + encodeURIComponent("Pridaj aspoň jednu položku"));
  }
  const validItems = items!.filter(
    (i) =>
      i.sap_number &&
      i.name &&
      i.packaging &&
      typeof i.quantity === "number" &&
      i.quantity > 0,
  );
  if (validItems.length === 0) {
    redirect("/admin/objednavky?err=" + encodeURIComponent("Žiadne platné položky"));
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("material_orders")
    .insert({
      title,
      description,
      area_m2,
      supplier,
      items: validItems,
      created_by: me.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createOrder] failed:", error.message);
    redirect("/admin/objednavky?err=" + encodeURIComponent("DB: " + error.message));
  }
  redirect(`/admin/objednavky/${data.id}`);
}

export async function updateOrderStatusAction(orderId: string, status: string) {
  await assertAdmin();
  const sb = createAdminClient();
  await sb.from("material_orders").update({ status }).eq("id", orderId);
}

export async function deleteOrderAction(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const sb = createAdminClient();
  await sb.from("material_orders").delete().eq("id", id);
  redirect("/admin/objednavky");
}
