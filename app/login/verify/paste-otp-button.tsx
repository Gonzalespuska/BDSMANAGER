"use client";

import * as React from "react";
import { Clipboard, Check, AlertCircle } from "lucide-react";

/**
 * PasteOtpButton — mobil-friendly „vlož zo schránky" tlačidlo.
 * User skopíruje 6-cifrový kód z emailu, klikne tlačidlo, kód sa vyplní
 * do #token inputu automaticky.
 *
 * Doplnkovo aktivuje aj Chrome/Android WebOTP API (ak by kód prišiel
 * cez SMS — pre email neplatí, ale nič to nestojí).
 *
 * User 2026-07-12: „ked pride email s kodom tak mi to auto vyplni ten
 * kod alebo aspon suggestne ze stlacim a vyplni sa".
 */
export function PasteOtpButton() {
  const [state, setState] = React.useState<
    "idle" | "pasted" | "empty" | "denied" | "unsupported"
  >("idle");

  // WebOTP API — pre Chrome/Android SMS auto-fill (Safari/email neriešime).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const OTPCredential = (
      window as unknown as {
        OTPCredential?: unknown;
      }
    ).OTPCredential;
    if (!OTPCredential) return;
    const ac = new AbortController();
    // TypeScript nemá typy pre WebOTP → any
    (
      navigator.credentials as unknown as {
        get?: (opts: {
          otp: { transport: string[] };
          signal: AbortSignal;
        }) => Promise<{ code?: string } | null>;
      }
    )
      .get?.({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((otp) => {
        if (otp?.code) {
          const input = document.getElementById("token") as HTMLInputElement | null;
          if (input) {
            input.value = otp.code;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            setState("pasted");
          }
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  async function paste() {
    try {
      // navigator.clipboard.readText vyžaduje HTTPS + user gesture
      const text = await navigator.clipboard.readText();
      if (!text) {
        setState("empty");
        setTimeout(() => setState("idle"), 2500);
        return;
      }
      // Extraktne prvý 4-8 cifrový blok — user možno mal kód s inými znakmi.
      const match = text.match(/\d{4,8}/);
      const code = match ? match[0] : text.replace(/\D/g, "").slice(0, 6);
      if (!code) {
        setState("empty");
        setTimeout(() => setState("idle"), 2500);
        return;
      }
      const input = document.getElementById("token") as HTMLInputElement | null;
      if (input) {
        input.value = code;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
        setState("pasted");
        setTimeout(() => setState("idle"), 1500);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("permission") || msg.includes("denied")) {
        setState("denied");
      } else {
        setState("unsupported");
      }
      setTimeout(() => setState("idle"), 3000);
    }
  }

  // Skryť tlačidlo úplne ak sme na server-side alebo v prostredí bez clipboard API
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => {
    setAvailable(
      typeof window !== "undefined" &&
        typeof navigator !== "undefined" &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.readText === "function",
    );
  }, []);

  if (!available) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={paste}
        className={
          "w-full inline-flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-bold transition-colors " +
          (state === "pasted"
            ? "border-emerald-400 bg-emerald-50 text-emerald-900"
            : state === "denied" || state === "unsupported" || state === "empty"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900")
        }
      >
        {state === "pasted" ? (
          <>
            <Check className="w-4 h-4" />
            Kód vložený
          </>
        ) : state === "denied" || state === "unsupported" || state === "empty" ? (
          <>
            <AlertCircle className="w-4 h-4" />
            {state === "denied"
              ? "Prehliadač odmietol prístup ku schránke"
              : state === "empty"
                ? "Žiadny kód v schránke"
                : "Vloženie zo schránky nefunguje na tomto prehliadači"}
          </>
        ) : (
          <>
            <Clipboard className="w-4 h-4" />
            📋 Vložiť kód zo schránky
          </>
        )}
      </button>
    </div>
  );
}
