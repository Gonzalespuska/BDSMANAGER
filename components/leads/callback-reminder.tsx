"use client";

import * as React from "react";
import { Calendar } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Veľký pripomienkový pill na lead karte (Nezdvíhali tab).
 * Pravý okraj karty, dátum + live countdown ("o X min").
 *
 * Countdown sa updateuje každú minútu cez setInterval.
 */
export function CallbackReminder({ when }: { when: string }) {
  const target = React.useMemo(() => new Date(when).getTime(), [when]);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const diffMs = target - now;
  const isPast = diffMs < 0;
  const absMin = Math.round(Math.abs(diffMs) / 60_000);
  const absHr = Math.round(absMin / 60);

  let countdown: string;
  if (absMin < 1) {
    countdown = isPast ? "teraz, voľaj" : "už každú chvíľu";
  } else if (absMin < 60) {
    countdown = isPast ? `pred ${absMin} min` : `o ${absMin} min`;
  } else if (absHr < 24) {
    const min = absMin % 60;
    if (min === 0) {
      countdown = isPast ? `pred ${absHr} h` : `o ${absHr} h`;
    } else {
      countdown = isPast
        ? `pred ${absHr}h ${min}min`
        : `o ${absHr}h ${min}min`;
    }
  } else {
    const days = Math.floor(absHr / 24);
    countdown = isPast ? `pred ${days} dňami` : `o ${days} dní`;
  }

  const dateLabel = new Date(when).toLocaleString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "inline-flex items-start gap-2 px-3 py-2 rounded-lg border",
        isPast
          ? "bg-red-50 dark:bg-red-950/30 border-red-200 text-red-900 dark:text-red-200"
          : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 text-blue-900 dark:text-blue-200",
      )}
    >
      <Calendar
        className={cn(
          "w-6 h-6 mt-0.5 shrink-0",
          isPast ? "text-red-600 dark:text-red-300" : "text-blue-600 dark:text-blue-300",
        )}
        aria-hidden
      />
      <div>
        <div
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            isPast ? "text-red-700/80" : "text-blue-700/80",
          )}
        >
          {isPast ? "Pripomienka prešla" : "Pripomienka volania"}
        </div>
        <div className="text-xl md:text-2xl font-extrabold leading-none tabular-nums">
          {dateLabel}
        </div>
        <div
          className={cn(
            "text-xs md:text-sm font-bold mt-1",
            isPast ? "text-red-700" : "text-blue-700",
          )}
        >
          {countdown}
        </div>
      </div>
    </div>
  );
}
