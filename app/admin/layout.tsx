import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";

/**
 * /admin/* — chránené pre rolu `admin`.
 * Auth wall už urobil middleware; tu si overujeme rolu.
 *
 * Ak user nie je prihlásený → fallback redirect na /login (defensive).
 * Ak má rolu `user` (nie admin) → redirect na /agent.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/agent");

  const selfPaused = user.capacity === 0;
  return <AppShell user={user} selfPaused={selfPaused}>{children}</AppShell>;
}
