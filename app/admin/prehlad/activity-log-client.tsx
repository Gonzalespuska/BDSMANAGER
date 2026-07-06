"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const SYSTEM_ACTIVITY_TYPES = new Set<string>([
  "web_webhook",
  "manual",
  "magiclink",
  "returned",
  "status_changed",
]);

export type ActivityRow = {
  id: string;
  lead_id: string | null;
  user_id: string | null;
  type: string;
  data: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
  lead_name: string | null;
  is_fallback_user: boolean;
};

interface Props {
  activities: ActivityRow[];
}

export function ActivityLogClient(props: Props) {
  const activities = props.activities;
  const [showSystem, setShowSystem] = React.useState(false);
  const filtered = React.useMemo(() => {
    if (showSystem) return activities;
    return activities.filter((a) => !SYSTEM_ACTIVITY_TYPES.has(a.type));
  }, [activities, showSystem]);

  const hiddenCount = activities.length - filtered.length;

  return (
    <section className="rounded-2xl border-2 border-sky-200 bg-background overflow-hidden">
      <header className="px-4 py-3 border-b bg-sky-50/50 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-extrabold text-base inline-flex items-center gap-2 text-sky-900">
            Activity log
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {showSystem
              ? "Vsetko - " + filtered.length + " akcii"
              : "Iba ludske akcie - " + filtered.length + " viditelnych" + (hiddenCount > 0 ? " - " + hiddenCount + " skrytych systemovych" : "")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSystem}
              onChange={(e) => setShowSystem(e.target.checked)}
              className="accent-sky-600"
            />
            Zobrazit aj systemove
          </label>
          <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider bg-sky-100 px-2 py-0.5 rounded">
            live
          </span>
        </div>
      </header>
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground italic">
          {showSystem
            ? "Ziadne akcie."
            : "Ziadne ludske akcie. Zapni systemove na zobrazenie webhook eventov."}
        </div>
      ) : (
        <div className="overflow-auto max-h-[600px] relative">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b">
              <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-600">
                <th className="text-left px-3 py-2 w-24">Cas</th>
                <th className="text-left px-3 py-2 w-40">Kto</th>
                <th className="text-left px-3 py-2">Akcia</th>
                <th className="text-left px-3 py-2">Lead</th>
                <th className="text-right px-3 py-2 w-28">Kedy</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((a) => (
                <ActivityRowView key={a.id} row={a} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ActivityRowView({ row }: { row: ActivityRow }) {
  const created = new Date(row.created_at);
  const time = created.toLocaleTimeString("sk-SK", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateKey = created.toLocaleDateString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
  });
  const localized = localizeActivity(row.type, row.data);
  const rel = formatRelativeSec(created);
  const isSystem = SYSTEM_ACTIVITY_TYPES.has(row.type);
  return (
    <tr className={cn("hover:bg-sky-50/60 transition-colors", isSystem && "opacity-60")}>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
        <div className="text-sm font-black text-slate-900">{time}</div>
        <div className="text-[10px] text-muted-foreground">{dateKey}</div>
      </td>
      <td className="px-3 py-2">
        {row.user_name ? (
          <span
            className={cn(
              "font-bold text-sm",
              row.is_fallback_user && "italic text-muted-foreground",
            )}
          >
            {row.user_name}
          </span>
        ) : (
          <span className="text-[11px] italic text-muted-foreground">
            {isSystem ? "system" : "-"}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={cn("text-sm", isSystem && "text-muted-foreground")}>
          {localized}
        </span>
      </td>
      <td className="px-3 py-2">
        {row.lead_id ? (
          <Link
            href={"/agent/leads/" + row.lead_id}
            className="text-sm font-semibold text-sky-700 hover:underline"
          >
            {row.lead_name ?? "-"}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
        {rel}
      </td>
    </tr>
  );
}

function localizeActivity(type: string, data: Record<string, unknown> | null): string {
  switch (type) {
    case "call_answered":
      return "Zdvihol";
    case "call_missed":
      return "Nedviha";
    case "phone_revealed":
      return "Odhalil cislo";
    case "note_added":
      return "Pridal poznamku";
    case "email_sent":
    case "email":
      return "Poslal email";
    case "handed_over_to_inspection":
      return "Posunul na obhliadku";
    case "handed_over_to_realization":
      return "Posunul na realizaciu";
    case "inspection_completed":
      return "Dokoncil obhliadku";
    case "realization_completed":
      return "Dokoncil realizaciu";
    case "media_uploaded":
      return "Nahral fotky";
    case "status_changed": {
      const to = (data?.to ?? data?.new_status) as string | undefined;
      return "Zmenil status" + (to ? " -> " + to : "");
    }
    case "manually_archived":
      return "Archivoval";
    case "claimed":
      return "Prevzal lead";
    case "web_webhook":
      return "Novy lead z webu";
    case "manual":
      return "Manualny lead";
    case "magiclink":
      return "Magic link";
    case "returned":
      return "Vrateny";
    default:
      return type;
  }
}

function formatRelativeSec(then: Date): string {
  const diffMs = Date.now() - then.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return "pred " + diffSec + "s";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return "pred " + diffMin + "min";
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return "pred " + diffH + "h";
  const diffD = Math.floor(diffH / 24);
  return "pred " + diffD + "d";
}
