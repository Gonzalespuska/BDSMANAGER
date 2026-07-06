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
 * Okrem toho FILTRÚJEME leady podľa NÁZVU:
 *   • Ak name začína "TEST ", "TEST·", "TEST REAL", "TEST OBHL",
 *     "TEST-", "TEST_", je považovaný za tester lead a NEráta sa
 *     do žiadnej štatistiky ani zoznamu na /admin/prehlad,
 *     top obchodáci, uncalled count, gap-monitoring atď.
 *
 * User confirmation:
 *   "nepocitaj testy do ziadnych statistik tie testy sluzia iba na to
 *    aby som si z info emailu mohol sledovat ako tento software funguje"
 *
 * Zoznam emailov je centralizovaný tu, aby sa daný filter dal ľahko
 * upraviť keby pribudol ďalší tester (napr. developerov účet).
 */
export const TEST_USER_EMAILS = ["info@epoxidovo.sk"] as const;

/** Prefixy v `leads.name` ktoré označujú testovací lead. */
const TEST_LEAD_NAME_PATTERNS = [
  /^\s*test\b/i, // "TEST · X", "TEST OBHL · X", "TEST REAL · X", "test-", "test_"
];

/** Rýchly check: je táto email adresa test-account? */
export function isTestUserEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEST_USER_EMAILS.includes(email.toLowerCase().trim() as (typeof TEST_USER_EMAILS)[number]);
}

/** Je názov leadu testovací? (napr. "TEST · Peter Novák", "test_lead") */
export function isTestLeadName(name: string | null | undefined): boolean {
  if (!name) return false;
  return TEST_LEAD_NAME_PATTERNS.some((r) => r.test(name));
}

/**
 * Komplet check: lead je "test" ak
 *   1) je priradený test-user-ovi (Mário), ALEBO
 *   2) jeho name spĺňa TEST prefix
 *
 * `testUserIds` je Set z fetchTestUserIds().
 */
export function isTestLead(
  lead: { name?: string | null; assigned_to?: string | null },
  testUserIds: Set<string>,
): boolean {
  if (lead.assigned_to && testUserIds.has(lead.assigned_to)) return true;
  if (isTestLeadName(lead.name)) return true;
  return false;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchTestUserIds(sb: any): Promise<Set<string>> {
  try {
    const { data } = await sb
      .from("users")
      .select("id")
      .in("email", TEST_USER_EMAILS);
    return new Set(
      ((data as Array<{ id: string }> | null) ?? []).map((u) => u.id),
    );
  } catch {
    return new Set();
  }
}
