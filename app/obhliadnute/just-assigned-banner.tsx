"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Hammer, Sparkles, X } from "lucide-react";

/**
 * Banner na /obhliadnute po úspešnom priradení realizácie z kalendára.
 * Auto-dismiss 8 s + čistí query params.
 */
export function JustAssignedBanner({
  leadName,
  mode,
  date,
  time,
}: {
  leadName: string;
  mode: string;
  date: string;
  time: string;
}) {
  const router = useRouter();
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    if (!visible) {
      const url = new URL(window.location.href);
      url.searchParams.delete("justAssigned");
      url.searchParams.delete("assignedName");
      url.searchParams.delete("assignedMode");
      url.searchParams.delete("assignedDate");
      url.searchParams.delete("assignedTime");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [visible, router]);

  if (!visible) return null;

  const isRealization = mode === "realization";
  const dateNice = new Date(date + "T00:00:00").toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div
      className="relative rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-lg shadow-emerald-500/20 animate-in slide-in-from-top-4 fade-in duration-300"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center z-20 transition-colors"
        aria-label="Zavrieť"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 px-5 py-5 text-white relative overflow-hidden">
        <div className="absolute top-2 right-16 opacity-20">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="absolute bottom-2 left-8 opacity-20">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-4 relative">
          <div className="shrink-0 w-14 h-14 rounded-full bg-white/25 border-4 border-white flex items-center justify-center animate-pulse">
            <Check className="w-8 h-8 text-white stroke-[3]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl md:text-2xl font-black leading-tight inline-flex items-center gap-2">
              {isRealization ? <Hammer className="w-6 h-6" /> : "🔍"}
              {isRealization ? "Realizácia priradená ✓" : "Obhliadka priradená ✓"}
            </div>
            <div className="text-sm text-emerald-50 font-semibold inline-flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Bell className="w-3.5 h-3.5" />
              <strong>{leadName}</strong> · {dateNice} o {time} ·{" "}
              {isRealization ? "realizator dostal notifikáciu" : "obhliadkár dostal notifikáciu"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
