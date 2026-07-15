import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft, KeyRound, Mail, Sparkles } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentAppUser, dashboardPathForRole } from "@/lib/auth";
import { verifyOtpAction } from "../actions";
import { VerifyOtpSubmit } from "./verify-submit";
import { PasteOtpButton } from "./paste-otp-button";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Zadaj kód · Epoxidovo Manager",
  robots: { index: false, follow: false },
};

interface VerifyPageProps {
  searchParams: Promise<{ email?: string; error?: string; test?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Zadaj 6-cifrový kód.",
  invalid: "Kód je nesprávny alebo vypršal. Skús znovu alebo si vyžiadaj nový.",
};

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { email = "", error, test } = await searchParams;
  const isTestMode = test === "1";

  // Bez ?test=1 — v dev móde by ťa dev bypass rovno prihlásil. Pri reálnom
  // teste OTP flow musí ?test=1 zostať aby si zadal kód.
  if (!isTestMode) {
    const existing = await getCurrentAppUser();
    if (existing) {
      redirect(dashboardPathForRole(existing.role));
    }
  }

  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  if (!email) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100 p-4 sm:p-6 relative overflow-hidden">
      <div
        className="absolute top-[-160px] left-[-160px] w-[420px] h-[420px] rounded-full bg-sky-200/40 blur-3xl pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute bottom-[-200px] right-[-160px] w-[480px] h-[480px] rounded-full bg-sky-300/30 blur-3xl pointer-events-none"
        aria-hidden
      />

      <div className="w-full max-w-md relative z-10">
        {/* Logo + nadpis */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/30 mb-3">
            <Sparkles className="w-7 h-7" aria-hidden />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
            Epoxidovo<span className="text-sky-500"> Manager</span>
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            CRM
          </div>
        </div>

        {/* Karta */}
        <div className="rounded-2xl border border-sky-100 bg-white/80 backdrop-blur shadow-2xl shadow-sky-900/5 p-6 sm:p-8 space-y-5">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 mb-3">
              <KeyRound className="w-6 h-6" aria-hidden />
            </div>
            <h1 className="text-lg font-extrabold tracking-tight">
              Zadaj prihlasovací kód
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              Kód sme poslali na <br />
              <span className="font-bold text-foreground inline-flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3 text-sky-500" aria-hidden />
                {email}
              </span>
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/80 uppercase tracking-wider font-bold">
              Platí 1 hodinu
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2.5 text-sm text-rose-900"
            >
              <AlertCircle
                className="w-4 h-4 mt-0.5 shrink-0 text-rose-600"
                aria-hidden
              />
              <span>{errorMessage}</span>
            </div>
          )}

          <form action={verifyOtpAction} className="space-y-3">
            <input type="hidden" name="email" value={email} />
            {isTestMode && <input type="hidden" name="test" value="1" />}
            <div className="space-y-1.5">
              <Label
                htmlFor="token"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                6-cifrový kód
              </Label>
              <Input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                autoComplete="one-time-code"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                required
                placeholder="123456"
                className="text-3xl font-mono tracking-[0.4em] text-center h-16 font-bold border-sky-200 focus:border-sky-500 focus:ring-sky-500/30"
              />
              <p className="text-[11px] text-muted-foreground leading-tight">
                📱 <strong>Mobil:</strong> Otvor Mail appku a kód sa objaví
                nad klávesnicou ako návrh (iOS auto-detektor). Alebo klikni
                „Vložiť zo schránky".
              </p>
            </div>

            <PasteOtpButton />
            <VerifyOtpSubmit />
          </form>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <Link
              href={isTestMode ? "/login?test=1" : "/login"}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-sky-700 font-semibold"
            >
              <ArrowLeft className="w-3 h-3" aria-hidden />
              Iný email
            </Link>
            <Link
              href={`/login?email=${encodeURIComponent(email)}${isTestMode ? "&test=1" : ""}`}
              className="text-sky-600 hover:text-sky-800 font-semibold"
            >
              Poslať nový kód →
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-muted-foreground/70 uppercase tracking-wider font-bold">
          Epoxidovo s.r.o. · CRM systém
        </p>
      </div>
    </main>
  );
}
