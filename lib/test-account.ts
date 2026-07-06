/**
 * Test account isolation — info@epoxidovo.sk (Mário Vitáz).
 *
 * Ide o admin/tester účet ktorý:
 *   • sa NEsmie objaviť v žiadnych obchodáckych štatistikách
 *     (Top obchodáci, workload, delta, konverzný pomer, ...)
 *   • sa NEsmie objaviť ako "assigned_to" pre reálne leady
 *   • jeho manuálne vytvorené leady sa auto-priradia inému
 *     obchodníkovi (viď /api/lead/create-manual)
 *
 * Zoznam emailov je centralizovaný tu, aby sa daný filter dal ľahko
 * upraviť keby pribudol ďalší tester (napr. developerov účet).
 */
export const TEST_USER_EMAILS = ["info@epoxidovo.sk"] as const;

/** Rýchly check: je táto email adresa test-account? */
export function isTestUserEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEST_USER_EMAILS.includes(email.toLowerCase().trim() as (typeof TEST_USER_EMAILS)[number]);
}

/**
 * Fetch test user IDs z DB (Supabase admin client).
 * Cachujeme cez React "cache()" wrapper na strane callera; tu robíme
 * len raw query. Vráti prázdny Set ak žiadny test user neexistuje.
 *
 * Použitie:
 *   const testIds = await fetchTestUserIds(sb);
 *   const filtered = leads.filter(l => !l.assigned_to || !testIds.has(l.assigned_to));
 */
export async function fetchTestUserIds(sb: {
  from: (t: string) => {
    select: (c: string) => {
      in: (
        col: string,
        vals: readonly string[],
      ) => Promise<{ data: Array<{ id: string }> | null }>;
    };
  };
}): Promise<Set<string>> {
  try {
    const { data } = await sb
      .from("users")
      .select("id")
      .in("email", TEST_USER_EMAILS);
    return new Set((data ?? []).map((u) => u.id));
  } catch {
    return new Set();
  }
}
