"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

/**
 * ThemeToggle — dark / light mode switch v hlavičke.
 *
 * User 2026-07-16: „a kde je ten switch co sme sa bavili na dark theme
 * a white theme".
 *
 * Ukladá do localStorage['theme'] = 'light' | 'dark'. Ak nič nie je,
 * spadne do system preference (prefers-color-scheme). Skript v
 * app/layout.tsx nastaví triedu `dark` na <html> pred hydration
 * (žiadny FOUC pri načítaní).
 *
 * Tailwind má `darkMode: ["class"]` — všetky `dark:` variantov sa
 * aplikujú keď je `class="dark"` na <html>.
 */
export function ThemeToggle() {
  const [theme, setTheme] = React.useState<"light" | "dark" | null>(null);

  // Initial sync — po mount čítame aktuálny stav <html>
  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode / storage disabled */
    }
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  // Kým nezistíme initial state, nič nezobrazíme (aby sa button nesa
  // preblikol nesprávnou ikonou).
  if (theme === null) {
    return (
      <div className="w-9 h-9 md:w-10 md:h-10 rounded-full border bg-background" />
    );
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full border bg-background hover:bg-muted transition-colors"
      title={isDark ? "Prepnúť na svetlú tému" : "Prepnúť na tmavú tému"}
      aria-label={isDark ? "Svetlá téma" : "Tmavá téma"}
    >
      {isDark ? (
        <Sun className="w-4 h-4 md:w-5 md:h-5 text-amber-500" aria-hidden />
      ) : (
        <Moon className="w-4 h-4 md:w-5 md:h-5 text-slate-700" aria-hidden />
      )}
    </button>
  );
}
