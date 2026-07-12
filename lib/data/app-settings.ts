import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Helpers na čítanie app_settings kľúčov s fallbackmi ak SQL migrácia
 * ešte nebežala.
 */

/**
 * Vráti minimálnu hodnotu zákazky pre Zodpovednosť papier (default 2500 €).
 * User: "tuto zodpovednost budeme davat iba na zakazky nad 2500 eur …
 *   v admine musim mat moznost zaskrtnut od kolko e chcem davat zodpovednost".
 */
export async function getZodpovednostMinEur(): Promise<number> {
  try {
    const sb = createAdminClient();
    const { data } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "zodpovednost_min_eur")
      .maybeSingle();
    const raw = data?.value;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") {
      const n = parseFloat(raw);
      if (!isNaN(n)) return n;
    }
  } catch {
    /* SQL 36 nebežala — fallback nižšie */
  }
  return 2500;
}

/**
 * Vráti true ak lead je oprávnený na Zodpovednosť papier.
 * Kritérium: value_estimate >= zodpovednost_min_eur.
 */
export function isEligibleForResponsibility(
  valueEstimate: number | null | undefined,
  minEur: number,
): boolean {
  if (minEur <= 0) return true; // 0 = zobraz vždy
  if (typeof valueEstimate !== "number") return false;
  return valueEstimate >= minEur;
}
