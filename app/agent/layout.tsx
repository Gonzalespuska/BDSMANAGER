import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";

/**
 * /agent/* — prístupné pre `admin` aj `user` rolu.
 * Auth wall už urobil middleware; tu si overujeme app-user záznam.
 */
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}
