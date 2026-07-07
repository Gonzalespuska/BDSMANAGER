import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser } from "@/lib/auth";
import { loadNotifications } from "@/lib/notifications";

export const runtime = "edge";

/**
 * /obhliadky/* — len pre rolu "obhliadky" alebo "admin".
 * Page guard (page.tsx) preverí rolu — tu len Stable AppShell wrapper.
 */
export default async function ObhliadkyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch (e) {
    console.error("[obhliadky/layout] getCurrentAppUser threw:", e);
    redirect("/login");
  }
  if (!user) redirect("/login");

  const selfPaused = user.capacity === 0;
  let notifications;
  try {
    notifications = await loadNotifications(user.id);
  } catch (e) {
    console.error("[obhliadky/layout] loadNotifications threw:", e);
    notifications = [];
  }
  return (
    <AppShell user={user} selfPaused={selfPaused} notifications={notifications}>
      {children}
    </AppShell>
  );
}
