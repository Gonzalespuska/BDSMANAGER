import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { loadNotifications } from "@/lib/notifications";

export const runtime = "edge";

/**
 * /admin/* — chránené pre rolu `admin`.
 * Auth wall už urobil middleware; tu si overujeme rolu.
 *
 * Používame REÁLNU rolu (getRealUserRole), nie overriden z view_as_role
 * cookie — inak by admin s "View as obchod" bol vyhodený z /admin. Cookie
 * override slúži IBA pre simuláciu obchodáckeho UX, nie na blokovanie admin
 * sekcie.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const selfPaused = user.capacity === 0;
  const notifications = await loadNotifications(user.id);
  return (
    <AppShell user={user} selfPaused={selfPaused} notifications={notifications}>
      {children}
    </AppShell>
  );
}
