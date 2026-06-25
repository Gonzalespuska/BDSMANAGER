"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Pill v hornom nav-bare — aktívny stav (matchuje aktuálnu route) je
 * zvýraznený sky-blue gradientom, neaktívne sú biele s borderom.
 *
 * Match logika:
 *   - href="/agent" → aktívne ak path začína /agent (vrátane /agent/leads/...)
 *   - href="/generator" → aktívne ak path začína /generator
 *   - href="/admin" → aktívne ak path začína /admin
 */
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
  const active = pathname === href || pathname.startsWith(href + "/");

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
