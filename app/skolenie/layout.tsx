import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser } from "@/lib/auth";
import { loadNotifications } from "@/lib/notifications";

export const runtime = "edge";

/**
 * /skolenie — layout shell pre onboarding/training sekciu.
 *
 * Prístup: každá rola. Aj admin (má prístup do všetkého), aj nováčik s
 * rolou "skolenie" (jediná sekcia ktorú vidí), aj obchod/obhliadky/
 * realizacie (môžu si materiály zaskočiť zopakovať).
 */
export default async function SkolenieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const selfPaused = user.capacity === 0;
  const notifications = await loadNotifications(user.id);
  return (
    <AppShell user={user} selfPaused={selfPaused} notifications={notifications}>
      {children}
    </AppShell>
  );
}
