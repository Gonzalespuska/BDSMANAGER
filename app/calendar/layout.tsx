import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";

export default async function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const selfPaused = user.capacity === 0;
  return (
    <AppShell user={user} selfPaused={selfPaused}>
      {children}
    </AppShell>
  );
}
