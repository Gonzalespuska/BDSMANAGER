"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Camera,
  Check,
  Droplets,
  Ruler,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

/**
 * Banner ktorý sa zobrazí keď obhliadkár práve odoslal obhliadku.
 * Zobrazí sa hore v /obhliadky (Aktívne tab), potvrdenie + zhrnutie.
 *
 * Prečo banner a nie modal:
 *   Modal v inspection-wizard sa unmountoval hneď po odoslaní (revalidatePath
 *   spustil RSC refresh a `alreadyCompleted` flip prepol wizard na Review).
 *   Banner na /obhliadky prežije lebo je súčasťou destination page.
 *
 * Dismiss:
 *   - Klik na ✕
 *   - Kliknutie kdekoľvek inde na stránke (nechceme rušiť ďalšiu prácu)
 *   - Auto po 8 s
 */
export function JustSubmittedBanner({
  leadName,
  m2,
  moist,
  adh,
  photos,
}: {
  leadName: string;
  m2: string;
  moist: string;
  adh: string;
  photos: string;
}) {
  const router = useRouter();
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    if (!visible) {
      // Vyčisti query params — aby refresh neukázal banner znova
      const url = new URL(window.location.href);
      url.searchParams.delete("justSubmitted");
      url.searchParams.delete("m2");
      url.searchParams.delete("moist");
      url.searchParams.delete("adh");
      url.searchParams.delete("photos");
      router.replace(url.pathname + (url.search ? url.search : ""), {
        scroll: false,
      });
    }
  }, [visible, router]);

  if (!visible) return null;

  return (
    <div
      className="relative rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-lg shadow-emerald-500/20 animate-in slide-in-from-top-4 fade-in duration-300"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center z-10 transition-colors"
        aria-label="Zavrieť"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header — celebration */}
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
            <div className="text-xl md:text-2xl font-black leading-tight">
              Obhliadka odoslaná ✓
            </div>
            <div className="text-sm text-emerald-50 font-semibold inline-flex items-center gap-1.5 mt-0.5">
              <Bell className="w-3.5 h-3.5" />
              Obchodník už dostal notifikáciu — je to v jeho sekcii
              „Obhliadnuté"
            </div>
          </div>
        </div>
      </div>

      {/* Body — zhrnutie čo bolo odoslané */}
      <div className="bg-white px-5 py-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1.5">
          Odoslané dáta pre „{leadName}"
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {m2 && (
            <Chip
              icon={<Ruler className="w-3 h-3" />}
              label={`${m2} m²`}
            />
          )}
          {moist && (
            <Chip
              icon={<Droplets className="w-3 h-3" />}
              label={`Vlhkosť ${moist}%`}
            />
          )}
          {adh && (
            <Chip
              icon={<Zap className="w-3 h-3" />}
              label={`Odtrh ${adh} MPa`}
            />
          )}
          {photos !== "0" && (
            <Chip
              icon={<Camera className="w-3 h-3" />}
              label={`${photos} fotiek`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-1 rounded-md font-black tabular-nums">
      {icon}
      {label}
    </span>
  );
}
