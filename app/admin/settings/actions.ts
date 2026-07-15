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

/**
 * Uloží override ceny materiálu.
 */
export async function saveMaterialPriceAction(formData: FormData) {
  const me = await assertAdmin();
  const materialId = String(formData.get("material_id") ?? "").trim();
  const priceField = String(formData.get("price_field") ?? "").trim();
  const price = parseFloat(String(formData.get("price") ?? "0").replace(",", "."));

  if (!materialId) {
    redirect("/admin/settings?tab=materials&err=" + encodeURIComponent("Missing material_id"));
  }
  if (!["price_per_sqm", "price_per_unit", "price_per_sqm_per_mm"].includes(priceField)) {
    redirect("/admin/settings?tab=materials&err=" + encodeURIComponent("Neplatný price_field"));
  }
  if (!Number.isFinite(price) || price < 0) {
    redirect("/admin/settings?tab=materials&err=" + encodeURIComponent("Neplatná cena"));
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("material_overrides")
    .upsert(
      {
        material_id: materialId,
        [priceField]: price,
        updated_by: me.id,
      },
      { onConflict: "material_id" },
    );

  if (error) {
    console.error("[saveMaterialPrice] failed:", error.message);
    redirect(
      "/admin/settings?tab=materials&err=" + encodeURIComponent("DB: " + error.message),
    );
  }

  redirect("/admin/settings?tab=materials&ok=1");
}

/**
 * Zresetuje override — vráti cenu na pôvodnú z hardcoded MATERIALS.
 */
export async function resetMaterialPriceAction(formData: FormData) {
  await assertAdmin();
  const materialId = String(formData.get("material_id") ?? "").trim();
  if (!materialId) {
    redirect("/admin/settings?tab=materials&err=" + encodeURIComponent("Missing material_id"));
  }

  const sb = createAdminClient();
  const { error } = await sb.from("material_overrides").delete().eq("material_id", materialId);
  if (error) {
    redirect(
      "/admin/settings?tab=materials&err=" + encodeURIComponent("DB: " + error.message),
    );
  }
  redirect("/admin/settings?tab=materials&ok=1");
}

/**
 * Uloží global setting a REDIRECTNE na /admin/settings.
 * Používa sa v HTML `<form action={...}>` — post-redirect-get pattern.
 * Client-side callers by mali použiť saveSettingV2 (vracia JSON).
 */
export async function saveSettingAction(formData: FormData) {
  const me = await assertAdmin();
  const key = String(formData.get("key") ?? "").trim();
  const rawValue = String(formData.get("value") ?? "").trim();

  if (!key) {
    redirect("/admin/settings?tab=global&err=" + encodeURIComponent("Missing key"));
  }

  // Try parse ako číslo, inak string
  let parsedValue: number | string;
  const num = parseFloat(rawValue.replace(",", "."));
  parsedValue = Number.isFinite(num) ? num : rawValue;

  const sb = createAdminClient();
  // UPSERT — ak kľúč ešte neexistuje, vytvorí ho. UPDATE by tichým 0-rows
  // pádom vytvoril ilúziu úspechu bez uloženia (bug do 2026-07-12).
  const { error } = await sb
    .from("app_settings")
    .upsert(
      {
        key,
        value: parsedValue,
        updated_by: me.id,
      },
      { onConflict: "key" },
    );

  if (error) {
    console.error("[saveSetting] failed:", error.message);
    redirect(
      "/admin/settings?tab=global&err=" + encodeURIComponent("DB: " + error.message),
    );
  }
  redirect("/admin/settings?tab=global&ok=1");
}

/**
 * V2 — pre client-side použitie. Vracia { ok, error }. Bez redirectu.
 * User 2026-07-12: „vsetko v tom admine sa da manualne nastavovat" —
 * client musí vedieť či save fakt prešlo, nielen chytiť NEXT_REDIRECT.
 */
export async function saveSettingV2(
  key: string,
  rawValue: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await assertAdmin();
  const k = key.trim();
  if (!k) return { ok: false, error: "missing_key" };

  let parsedValue: number | string;
  const num = parseFloat(rawValue.replace(",", "."));
  parsedValue = Number.isFinite(num) ? num : rawValue;

  const sb = createAdminClient();
  const { error } = await sb
    .from("app_settings")
    .upsert(
      { key: k, value: parsedValue, updated_by: me.id },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
