import { redirect } from "next/navigation";

import { dashboardPathForRole, getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";

export const dynamic = "force-dynamic";

/**
 * Root `/` — vždy redirect.
 * - Prihlásený → dashboard podľa role (/admin alebo /agent)
 * - Neprihlásený → /login
 *
 * Žiadny marketing page, app je len pre interný tím.
 */
export default async function Home() {
  const user = await getCurrentAppUser();
  if (user) redirect(dashboardPathForRole(user.role));
  redirect("/login");
}
