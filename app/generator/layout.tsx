import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";

/**
 * /generator/* — prístupné pre admin aj user (obchodník generuje ponuky).
 */
export default async function GeneratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}
