import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser } from "@/lib/auth";
import { loadNotifications } from "@/lib/notifications";

export const runtime = "edge";

/**
 * /workload/* — admin team workload page. Prístup len pre admin (alebo dev).
 */
export default async function WorkloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev && user.role !== "admin") redirect("/agent");

  const selfPaused = user.capacity === 0;
  const notifications = await loadNotifications(user.id);
  return (
    <AppShell user={user} selfPaused={selfPaused} notifications={notifications}>
      {children}
    </AppShell>
  );
}
