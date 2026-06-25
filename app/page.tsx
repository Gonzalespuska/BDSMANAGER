import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { dashboardPathForRole, getCurrentAppUser } from "@/lib/auth";

export const runtime = "edge";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Ak je už prihlásený, redirect rovno na dashboard.
  const user = await getCurrentAppUser();
  if (user) redirect(dashboardPathForRole(user.role));

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-lg text-center space-y-8">
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Business Data Sales Manager
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight">
            BDS<span className="text-sky-500">Manager</span>
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Call-agent CRM s SLA trackingom. Združuje leady zo všetkých zdrojov
            (web, Facebook Lead Ads, Instagram, Google, WhatsApp...) na jedno miesto.
          </p>
        </div>

        <div className="flex items-center justify-center">
          <Button asChild>
            <Link href="/login">Prihlásiť sa</Link>
          </Button>
        </div>

        <div className="text-xs text-muted-foreground border-t pt-6">
          Interný nástroj pre <strong>Epoxidovo s. r. o.</strong>
        </div>
      </div>
    </main>
  );
}
