"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Pill v hornom nav-bare — aktívny stav matchuje aktuálnu route.
 *
 * Longest-prefix wins logika: ak je viacero hrefov ktoré by mohli matchovať
 * (napr. /agent aj /agent/team), aktívny je ten najšpecifickejší — takže
 * /agent/team má prednost pred /agent ked si na /agent/team.
 */
const ALL_NAV_HREFS = [
  "/agent/team",
  "/agent/leads",
  "/agent",
  "/generator",
  "/admin",
];

function isActive(pathname: string, href: string): boolean {
  // Match prefix
  if (pathname !== href && !pathname.startsWith(href + "/")) return false;
  // Defer ak existuje špecifickejší prefix čo tiež matchuje pathname
  for (const other of ALL_NAV_HREFS) {
    if (other === href) continue;
    if (!other.startsWith(href + "/")) continue; // other not deeper than href
    if (pathname === other || pathname.startsWith(other + "/")) {
      return false; // špecifickejšia route vyhráva
    }
  }
  return true;
}

export function NavPillClient({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, href);

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all",
        active
          ? "bg-sky-500 text-white border border-sky-500 shadow-[0_4px_14px_rgba(14,165,233,0.35)]"
          : "border bg-background text-foreground hover:bg-muted/60",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
