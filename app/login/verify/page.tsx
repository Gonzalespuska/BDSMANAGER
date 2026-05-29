import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentAppUser, dashboardPathForRole } from "@/lib/auth";
import { verifyOtpAction } from "../actions";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Zadaj kód · BDSManager",
  robots: { index: false, follow: false },
};

interface VerifyPageProps {
  searchParams: Promise<{ email?: string; error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Zadaj 6-cifrový kód.",
  invalid: "Kód je nesprávny alebo vypršal. Skús znovu (alebo si vyžiadaj nový).",
};

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  // Ak je už prihlásený, redirect
  const existing = await getCurrentAppUser();
  if (existing) {
    redirect(dashboardPathForRole(existing.role));
  }

  const { email = "", error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  // Bez email parametra — pošli ho späť na /login
  if (!email) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Iný email
        </Link>

        <div className="rounded-lg border bg-background shadow-sm p-8 space-y-6">
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sky-100 text-sky-600 mb-4">
              <KeyRound className="w-6 h-6" aria-hidden />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              Zadaj prihlasovací kód
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Poslali sme kód na{" "}
              <strong className="text-foreground">{email}</strong>.
              <br />
              Kód platí 1 hodinu.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              <span>{errorMessage}</span>
            </div>
          )}

          <form action={verifyOtpAction} className="space-y-4">
            <input type="hidden" name="email" value={email} />
            <div className="space-y-1.5">
              <Label htmlFor="token">Prihlasovací kód</Label>
              <Input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6,10}"
                maxLength={10}
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder="12345678"
                className="text-2xl font-mono tracking-[0.3em] text-center h-14"
              />
            </div>

            <Button type="submit" className="w-full">
              Prihlásiť sa
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            Email neprišiel?{" "}
            <Link
              href={`/login?email=${encodeURIComponent(email)}`}
              className="text-sky-600 hover:underline font-medium"
            >
              Skús znovu
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
