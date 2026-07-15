import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { MetaTokenForm } from "./meta-token-form";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function MetaSetupPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3"
        >
          ← Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <KeyRound className="w-7 h-7 text-indigo-600" />
          Meta OAuth Token
        </h1>
      </header>

      <MetaTokenForm />
    </div>
  );
}
