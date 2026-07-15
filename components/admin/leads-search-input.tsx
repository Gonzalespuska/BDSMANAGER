"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

/**
 * LeadsSearchInput — persistent search bar na /admin/leads.
 * User 2026-07-15: „k de je akoze search button". Toto NIE JE modal ako
 * PoolSearchDrawer — filtruje priamo VIDITEĽNÝ list všetkých 500 leadov
 * čo už sú načítané (client-side substring match).
 *
 * Prepojenie s markup:
 *   • Vloží sa nad všetky sekcie (Nepridelené + per-agent)
 *   • Nastaví CSS classy na `<html data-lead-search="...">` — page.tsx
 *     má CSS pravidlo ktoré skryje karty čo nematchujú.
 *
 * Filter matchuje naprieč: name, phone, email, m2, mesto, agent name.
 * Match sa robí voči `data-lead-search-hay` atribute (server ho vloží
 * pre každú kartu ako lowercase substring blob).
 */
export function LeadsSearchInput() {
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    const query = q.trim().toLowerCase();
    // Cards
    const cards = document.querySelectorAll<HTMLElement>(
      "[data-lead-search-hay]",
    );
    let visibleCount = 0;
    cards.forEach((el) => {
      const hay = el.getAttribute("data-lead-search-hay") ?? "";
      const match = !query || hay.includes(query);
      el.style.display = match ? "" : "none";
      if (match) visibleCount++;
    });
    // Skryť prázdne sekcie
    const sections = document.querySelectorAll<HTMLElement>(
      "[data-lead-search-section]",
    );
    sections.forEach((sec) => {
      const cardsIn = sec.querySelectorAll<HTMLElement>(
        "[data-lead-search-hay]",
      );
      let anyVisible = false;
      cardsIn.forEach((c) => {
        if (c.style.display !== "none") anyVisible = true;
      });
      sec.style.display = anyVisible ? "" : "none";
    });
    // Update counter
    const counter = document.getElementById("leads-visible-counter");
    if (counter) counter.textContent = query ? String(visibleCount) : "";
  }, [q]);

  return (
    <div className="relative w-full max-w-md">
      <Search
        className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter podľa mena, telefónu, mesta, m², emailu…"
        className="w-full h-10 pl-10 pr-10 rounded-lg border-2 border-slate-300 text-sm focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500"
          title="Vyčistiť filter"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {q && (
        <div className="absolute -bottom-5 left-2 text-[10px] font-bold text-sky-700">
          Zobrazených: <span id="leads-visible-counter">0</span>
        </div>
      )}
    </div>
  );
}
