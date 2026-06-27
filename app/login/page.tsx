import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle, Mail, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentAppUser, dashboardPathForRole } from "@/lib/auth";
import { sendOtpAction } from "./actions";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Prihlásenie · Epoxidovo Manager",
  robots: { index: false, follow: false },
};

function errorMessage(
  error: string | undefined,
  seconds?: string,
): string | null {
  if (!error) return null;
  switch (error) {
    case "missing_email":
      return "Zadaj svoj email.";
    case "unauthorized":
      return "Tento email nemá prístup. Kontaktuj administrátora.";
    case "deactivated":
      return "Tvoj účet bol deaktivovaný. Kontaktuj administrátora.";
    case "rate_limit":
      return `Príliš často. Skús znova o ${seconds ?? "60"} sekúnd.`;
    case "send_failed":
      return "Posielanie kódu zlyhalo. Skús to znova o chvíľu.";
    default:
      return null;
  }
}

interface LoginPageSearch {
  error?: string;
  email?: string;
  seconds?: string;
  test?: string;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginPageSearch>;
}) {
  const { error, email: prefillEmail, seconds, test } = await searchParams;
  const isTestMode = test === "1";

  if (!isTestMode) {
    const existing = await getCurrentAppUser();
    if (existing) {
      redirect(dashboardPathForRole(existing.role));
    }
  }
  const msg = errorMessage(error, seconds);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100 p-4 sm:p-6 relative overflow-hidden">
      {/* Dekoračné kruhy v pozadí */}
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

        {/* Hlavná karta */}
        <div className="rounded-2xl border border-sky-100 bg-white/80 backdrop-blur shadow-2xl shadow-sky-900/5 p-6 sm:p-8 space-y-5">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">
              Prihlásenie
            </h1>
            <p className="text-sm text-muted-foreground mt-1 leading-snug">
              Zadaj svoj firemný email — pošleme ti 6-cifrový kód.
            </p>
          </div>

          {msg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2.5 text-sm text-rose-900"
            >
              <AlertCircle
                className="w-4 h-4 mt-0.5 shrink-0 text-rose-600"
                aria-hidden
              />
              <span>{msg}</span>
            </div>
          )}

          <form action={sendOtpAction} className="space-y-3">
            {isTestMode && <input type="hidden" name="test" value="1" />}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-500 pointer-events-none"
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
                  className="pl-9 h-11 text-sm font-semibold"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold shadow-md shadow-sky-500/30"
            >
              <Mail className="w-4 h-4 mr-2" aria-hidden />
              Pošli mi kód
            </Button>
          </form>

        </div>

        <p className="mt-6 text-center text-[10px] text-muted-foreground/70 uppercase tracking-wider font-bold">
          Epoxidovo s.r.o. · CRM systém
        </p>
      </div>
    </main>
  );
}
