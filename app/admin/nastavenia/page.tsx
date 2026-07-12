import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { NastaveniaClient } from "./nastavenia-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/nastavenia — mega admin dashboard so všetkými nastaveniami CRM.
 * User 2026-07-12: „musim mat funkcny admin kde viem ovladat celu stranku".
 *
 * Taby:
 *   1. Firma — IČO/DIČ/PDF footer/e-mail brand
 *   2. Doprava — sadzby + rezerva + rýchlosť
 *   3. Mestá — vzdialenosti od HQ (CRUD)
 *   4. Sika katalóg — SAP produkty (CRUD)
 *   5. Vlastné materiály — pridané položky do cenníka
 *   6. Zľavy — množstevné thresholds
 *   7. Skolenie — training moduly
 */
export default async function NastaveniaAdminPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  const admin = createAdminClient();
  const [
    settingsRes,
    citiesRes,
    sikaRes,
    trainingRes,
    materialsRes,
  ] = await Promise.all([
    admin.from("app_settings").select("key, value, label, description").order("key"),
    admin.from("city_distances").select("*").order("label"),
    admin.from("sika_catalog").select("*").order("name"),
    admin.from("training_modules").select("*").order("sort_order"),
    admin.from("custom_materials").select("*").order("sort_order"),
  ]);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
          <Settings2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black leading-tight">Nastavenia CRM</h1>
          <p className="text-sm text-muted-foreground">
            Firemné údaje · doprava · mestá · Sika katalóg · zľavy · školenie.
            Všetko čo je hardcoded v kóde, tu vieš zmeniť bez pomoci vývojára.
          </p>
        </div>
      </header>

      <NastaveniaClient
        settings={(settingsRes.data ?? []) as Array<{ key: string; value: unknown; label: string; description: string }>}
        cities={(citiesRes.data ?? []) as Array<{ slug: string; label: string; km_from_hq: number; active: boolean }>}
        sika={(sikaRes.data ?? []) as Array<{ sap_number: string; name: string; packaging: string; packaging_kg: number | null; category: string | null; active: boolean }>}
        training={(trainingRes.data ?? []) as Array<{ id: string; title: string; description: string | null; kind: string; media_url: string | null; duration_min: number | null; role_target: string[]; required: boolean; active: boolean }>}
        materials={(materialsRes.data ?? []) as Array<{ id: string; slug: string; label: string; category: string | null; price_per_sqm: number | null; price_per_unit: number | null; unit_label: string | null; active: boolean }>}
      />
    </div>
  );
}
