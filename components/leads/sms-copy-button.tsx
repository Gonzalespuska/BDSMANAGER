"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * SMS copy button — skopíruje SMS text do clipboardu.
 *
 * User 2026-07-16: „ked nezdvihal tak sa to presunie do tej nezdbihal
 * kategorie a da mu to moznost button skopirovat smsku ktoru mu posle,
 * az do doby dokym to nebude autoamticke ze to spravime potom tak ze
 * da iba nezdvihal a popri tom ak sa to presunie do nezdvihal sa mu
 * rovno autoamticky z cisla daneho obchodaka odosle smska".
 *
 * Manuálny copy je fáza 1. Fáza 2 = auto-SMS z čísla obchodáka
 * (Twilio / O2 API) — placeholder v /api/lead/action missed_call.
 */
export function SmsCopyButton({
  leadName,
  phone,
}: {
  leadName: string | null;
  phone: string | null;
}) {
  const [copied, setCopied] = React.useState(false);

  const firstName = (leadName ?? "").trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Dobrý deň, ${firstName}` : "Dobrý deň";
  const smsText = `${greeting}, snažil som sa Vás zastihnúť ohľadom cenovej ponuky epoxidových podláh. Prosím zavolajte späť keď budete voľní. Ďakujem, Epoxidovo.sk`;

  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(smsText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = smsText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success(
        phone
          ? `📋 SMS text skopírovaný — otvor SMS aplikáciu a pošli na ${phone}`
          : "📋 SMS text skopírovaný",
      );
      setTimeout(() => setCopied(false), 3500);
    } catch (e) {
      toast.error("Nepodarilo sa skopírovať — skús ručne z lead karty");
    }
  }

  const smsHref = phone
    ? `sms:${phone.replace(/\s/g, "")}?body=${encodeURIComponent(smsText)}`
    : null;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        onClick={copy}
        size="sm"
        className="flex-1 h-10 bg-violet-600 hover:bg-violet-700 text-white font-bold"
        title="Skopíruje SMS text — vlož v SMS aplikácii a odošli"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 mr-1.5" aria-hidden /> Skopírované
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 mr-1.5" aria-hidden /> Skopírovať SMS
          </>
        )}
      </Button>
      {smsHref && (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-10 md:hidden border-violet-300 text-violet-700 hover:bg-violet-50 font-bold"
          title="Otvorí SMS aplikáciu s predvyplneným textom"
        >
          <a href={smsHref}>📱 Poslať</a>
        </Button>
      )}
    </div>
  );
}
