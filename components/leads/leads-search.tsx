"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/**
 * LeadsSearch — search bar nad leadami.
 *
 * UX:
 *   - Input napravo od nadpisu (sticky to header)
 *   - Debounce 300ms → push query param ?q=keyword do URL
 *   - Server-side re-render strana s filterom cez .or() na name/phone/email/data fields
 *   - X tlačidlo clearu
 *   - Auto-focus na "/" keyboard shortcut (ako GitHub/Vercel)
 */
export function LeadsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [value, setValue] = React.useState(initialQ);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Push debounced query into URL
  React.useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      const trimmed = value.trim();
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => clearTimeout(handle);
    // We deliberately only depend on `value` — pathname/searchParams refs
    // change on every render and would re-trigger the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Keyboard "/" shortcut → focus search
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes(
          (document.activeElement?.tagName ?? "").toUpperCase(),
        )
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && inputRef.current === document.activeElement) {
        setValue("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full sm:w-80">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        <Search className="w-4 h-4" aria-hidden />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Hľadaj  (meno, lokalita, číslo...)"
        className="w-full pl-9 pr-9 py-2 rounded-xl border bg-background text-sm focus:outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10"
        aria-label="Hľadať v leadoch"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
          aria-label="Vyčistiť"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
      <div className="hidden md:flex absolute -bottom-7 right-0 items-center gap-1.5 text-xs text-foreground/70">
        <span>stlač</span>
        <kbd className="inline-flex items-center px-2 py-0.5 rounded-md border border-foreground/30 bg-muted font-mono text-[12px] font-bold leading-none">
          &quot;/&quot;
        </kbd>
        <span>pre rýchle hľadanie</span>
      </div>
    </div>
  );
}
