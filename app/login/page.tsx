import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft, Mail, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentAppUser, dashboardPathForRole } from "@/lib/auth";
import { sendOtpAction } from "./actions";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Prihlásenie · BDSManager",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; email?: string; seconds?: string }>;
}

function errorMessage(error: string | undefined, seconds?: string): string | null {
  if (!error) return null;
  switch (error) {
    case "missing_email":
      return "Zadaj svoj email.";
    case "unauthorized":
      return "Tento email nie je pridaný ako používateľ. Kontaktuj administrátora.";
    case "deactivated":
      return "Tvoj účet bol deaktivovaný. Kontaktuj administrátora.";
    case "rate_limit":
      return `Príliš často. Skús znova o ${seconds ?? "60"} sekúnd (Supabase free tier limit).`;
    case "send_failed":
      return "Posielanie kódu zlyhalo. Skús to znova o chvíľu.";
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Ak je už prihlásený, redirect rovno na dashboard
  const existing = await getCurrentAppUser();
  if (existing) {
    redirect(dashboardPathForRole(existing.role));
  }

  const { error, email: prefillEmail, seconds } = await searchParams;
  const msg = errorMessage(error, seconds);

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Späť
        </Link>

        <div className="rounded-lg border bg-background shadow-sm p-8 space-y-6">
          <div className="space-y-1.5">
            <div className="text-xl font-bold tracking-tight">
              BDS<span className="text-sky-500">Manager</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Zadaj svoj firemný email — pošleme ti 6-cifrový kód.
            </p>
          </div>

          {msg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              <span>{msg}</span>
            </div>
          )}

          <form action={sendOtpAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                  aria-hidden
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={prefillEmail}
                  placeholder="ty@epoxidovo.sk"
                  className="pl-9"
                />
              </div>
            </div>

            <Button type="submit" className="w-full">
              Poslať kód
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Prístup majú iba pozvaní používatelia. Ak ti prístup nefunguje,
            kontaktuj admina — <strong>info@epoxidovo.sk</strong>.
          </p>
        </div>

        {process.env.NODE_ENV !== "production" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
              <Zap className="w-3.5 h-3.5" aria-hidden />
              Dev only
            </div>
            <p className="text-xs text-amber-900 leading-relaxed">
              Bez OTP, bez emailu, jedným klikom prihlas ako admin
              (<code className="text-[10px] bg-amber-100 px-1 rounded">info@epoxidovo.sk</code>).
              Zmizne v production builde.
            </p>
            <Button
              asChild
              variant="outline"
              className="w-full border-amber-400 bg-amber-100 hover:bg-amber-200 text-amber-900"
            >
              <a href="/api/dev/login">🚀 Quick login</a>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
