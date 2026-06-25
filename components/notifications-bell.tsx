"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellRing, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/notifications";
import { timeAgo } from "@/lib/types/lead";

/**
 * Bell s počtom notifikácií v header bare. Klik → dropdown s listom.
 * Server-rendered initial notifications; bola by sa pripojiť aj realtime,
 * ale zatiaľ stačí "refresh on click".
 */
export function NotificationsBell({
  initial,
}: {
  initial: Notification[];
}) {
  const [open, setOpen] = React.useState(false);
  const [items] = React.useState<Notification[]>(initial);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const overdueCount = items.filter((n) => n.type === "callback_overdue").length;
  const totalCount = items.length;
  const hasAny = totalCount > 0;
  const Icon = overdueCount > 0 ? BellRing : Bell;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative inline-flex items-center justify-center w-10 h-10 rounded-full border bg-background hover:bg-muted/60 transition-colors",
          overdueCount > 0 && "border-red-300 bg-red-50 hover:bg-red-100",
        )}
        aria-label={`Notifikácie (${totalCount})`}
      >
        <Icon
          className={cn(
            "w-5 h-5",
            overdueCount > 0
              ? "text-red-600 animate-[wiggle_0.5s_ease-in-out_infinite]"
              : hasAny
                ? "text-foreground"
                : "text-muted-foreground",
          )}
          aria-hidden
        />
        {hasAny && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold text-white",
              overdueCount > 0 ? "bg-red-600" : "bg-sky-500",
            )}
          >
            {totalCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div>
              <div className="font-bold text-sm">Notifikácie</div>
              <div className="text-[11px] text-muted-foreground">
                {totalCount === 0
                  ? "Nič nové, máš pokoj 🌴"
                  : `${totalCount} ${totalCount === 1 ? "položka" : "položiek"}`}
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Žiadne pripomienky volania, nové leady, ani follow-upy.
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y">
              {items.map((n) => {
                const isOverdue = n.type === "callback_overdue";
                const isNew = n.type === "new_lead";
                return (
                  <li key={n.id}>
                    <Link
                      href={`/agent/leads/${n.lead_id}`}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={cn(
                                "inline-block w-2 h-2 rounded-full shrink-0",
                                isOverdue
                                  ? "bg-red-500"
                                  : isNew
                                    ? "bg-emerald-500"
                                    : "bg-amber-500",
                              )}
                              aria-hidden
                            />
                            <span className="font-semibold text-sm truncate">
                              {n.lead_name}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {n.message}
                          </div>
                          {n.lead_phone && (
                            <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                              {n.lead_phone}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[11px] text-muted-foreground">
                            {timeAgo(n.when_ts)}
                          </div>
                          <ExternalLink
                            className="w-3 h-3 text-muted-foreground/60 mt-1 ml-auto"
                            aria-hidden
                          />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
