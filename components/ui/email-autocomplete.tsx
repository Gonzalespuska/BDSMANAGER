"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Email input s ghost-text autocomplete pre časté domény.
 * Po napísaní "@x" sa zobrazí najbližšia matching doména ako ghost text.
 * Tab alebo Enter doplní celé.
 *
 * Common SK + EU domény:
 *   gmail.com, seznam.cz, yahoo.com, outlook.com, hotmail.com,
 *   icloud.com, centrum.sk, centrum.cz, azet.sk, atlas.sk,
 *   post.cz, pobox.sk, proton.me, protonmail.com, email.cz,
 *   live.com, volny.cz, mail.com, t-zones.sk, orange.sk
 */
const EMAIL_DOMAINS = [
  "gmail.com",
  "seznam.cz",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "centrum.sk",
  "centrum.cz",
  "azet.sk",
  "atlas.sk",
  "post.cz",
  "pobox.sk",
  "proton.me",
  "protonmail.com",
  "email.cz",
  "email.sk",
  "live.com",
  "volny.cz",
  "mail.com",
  "t-zones.sk",
  "orange.sk",
  "epoxidovo.sk",
];

function pickSuggestion(value: string): string | null {
  const atIdx = value.lastIndexOf("@");
  if (atIdx < 0) return null;
  const after = value.slice(atIdx + 1).toLowerCase();
  if (!after) {
    // Ihned po @ navrhnem prvy default (gmail.com — najcastejsi)
    return "gmail.com";
  }
  // Doplň prvú doménu ktorá začína touto sekvenciou
  const match = EMAIL_DOMAINS.find((d) =>
    d.toLowerCase().startsWith(after),
  );
  if (!match) return null;
  if (match.toLowerCase() === after) return null; // už úplne napísané
  return match;
}

export function EmailAutocomplete({
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  const suggestion = pickSuggestion(value);
  const atIdx = value.lastIndexOf("@");
  const completedRest =
    suggestion && atIdx >= 0
      ? suggestion.slice(value.length - atIdx - 1)
      : "";

  function complete() {
    if (!suggestion || atIdx < 0) return;
    const newValue = value.slice(0, atIdx + 1) + suggestion;
    onChange(newValue);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Tab" || e.key === "Enter") && completedRest) {
      e.preventDefault();
      complete();
    }
    if (e.key === "ArrowRight" && completedRest) {
      const el = e.currentTarget;
      if (el.selectionStart === value.length) {
        e.preventDefault();
        complete();
      }
    }
  }

  return (
    <div
      className={cn("relative font-mono text-sm", className)}
      onClick={() => ref.current?.focus()}
    >
      {/* Ghost / overlay */}
      {completedRest && (
        <div
          aria-hidden
          className="absolute inset-0 px-3 py-2 pointer-events-none text-sm font-mono whitespace-pre"
        >
          <span className="invisible">{value}</span>
          <span className="text-muted-foreground/50">{completedRest}</span>
        </div>
      )}
      <input
        ref={ref}
        id={id}
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="relative w-full h-10 px-3 py-2 rounded-md border border-input bg-transparent text-sm font-mono outline-none focus:ring-2 focus:ring-foreground/20"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
