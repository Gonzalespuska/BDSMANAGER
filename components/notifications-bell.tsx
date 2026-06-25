"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellRing, ChevronDown, ExternalLink } from "lucide-react";

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
  const [showNewLeads, setShowNewLeads] = React.useState(false);
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

          <div className="max-h-[60vh] overflow-y-auto">
            {/* Sekcia 1: Pripomienka volať znova — vždy viditeľná */}
            {(() => {
              const callbacks = items.filter(
                (n) =>
                  n.type === "callback_due" || n.type === "callback_overdue",
              );
              return (
                <div>
                  <div className="px-4 py-2 bg-muted/30 border-b text-[11px] font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5 w-full">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                    Pripomienka volať znova ({callbacks.length})
                  </div>
                  {callbacks.length === 0 ? (
                    <div className="px-4 py-4 text-xs text-muted-foreground/80">
                      Žiadne pripomienky. Keď zákazník nezdvihne, automatická
                      pripomienka sa zobrazí tu.
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {callbacks.map((n) => (
                        <NotifRow
                          key={n.id}
                          n={n}
                          onClick={() => setOpen(false)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {/* Sekcia 2: Nový lead pridelený — collapsed by default, klik na header rozbalí */}
            {(() => {
              const news = items.filter((n) => n.type === "new_lead");
              return (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowNewLeads(!showNewLeads)}
                    className="px-4 py-2 bg-muted/30 border-b border-t text-[11px] font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5 w-full hover:bg-muted/50 transition-colors"
                    aria-expanded={showNewLeads}
                  >
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    Nový lead pridelený ({news.length})
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 ml-auto transition-transform",
                        showNewLeads && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>
                  {showNewLeads &&
                    (news.length === 0 ? (
                      <div className="px-4 py-4 text-xs text-muted-foreground/80">
                        Žiadne nepridelené leady.
                      </div>
                    ) : (
                      <ul className="divide-y">
                        {news.map((n) => (
                          <NotifRow
                            key={n.id}
                            n={n}
                            onClick={() => setOpen(false)}
                          />
                        ))}
                      </ul>
                    ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifRow({
  n,
  onClick,
}: {
  n: Notification;
  onClick: () => void;
}) {
  const isReminder =
    n.type === "callback_due" || n.type === "callback_overdue";
  return (
    <li>
      <Link
        href={`/agent/leads/${n.lead_id}`}
        onClick={onClick}
        className={cn(
          "block px-4 py-3 transition-colors",
          isReminder
            ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100/80 dark:hover:bg-red-950/40"
            : "hover:bg-muted/40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "font-semibold text-sm truncate",
                isReminder && "text-red-900 dark:text-red-200",
              )}
            >
              {n.lead_name}
            </div>
            <div
              className={cn(
                "text-xs",
                isReminder
                  ? "text-red-700/90 dark:text-red-300/90"
                  : "text-muted-foreground",
              )}
            >
              {n.message}
            </div>
            {n.lead_phone && (
              <div
                className={cn(
                  "text-[11px] mt-0.5",
                  isReminder
                    ? "text-red-700/70 dark:text-red-300/80"
                    : "text-muted-foreground/80",
                )}
              >
                {n.lead_phone}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div
              className={cn(
                "text-[11px]",
                isReminder
                  ? "text-red-700/70 dark:text-red-300/80"
                  : "text-muted-foreground",
              )}
            >
              {timeAgo(n.when_ts)}
            </div>
            <ExternalLink
              className={cn(
                "w-3 h-3 mt-1 ml-auto",
                isReminder
                  ? "text-red-600/70"
                  : "text-muted-foreground/60",
              )}
              aria-hidden
            />
          </div>
        </div>
      </Link>
    </li>
  );
}
