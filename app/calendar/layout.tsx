import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser } from "@/lib/auth";
import { loadNotifications } from "@/lib/notifications";

export const runtime = "edge";

export default async function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const selfPaused = user.capacity === 0;
  const notifications = await loadNotifications(user.id);
  return (
    <AppShell
      user={user}
      selfPaused={selfPaused}
      notifications={notifications}
      wide
    >
      {/*
        Calendar musí byt fixed na viewport bez scrollu. Header AppShell
        zaberá ~125px (top bar 70px + nav 55px) + DEV banner cca 26px keď
        je dev. Pre presný fit používame flexbox: main flex-1 + tento
        div ber 100% hostingu cez h-full. Body scroll-lock cez body class.
      */}
      <div className="h-full min-h-0 overflow-hidden">{children}</div>
    </AppShell>
  );
}
