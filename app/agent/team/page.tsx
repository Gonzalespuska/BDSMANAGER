import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle, MessageCircle, Users } from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { getTeamWorkload, formatInactive } from "@/lib/team";
import { loadChatHistory } from "@/lib/team-chat";
import { cn } from "@/lib/utils";
import { CapacityControl, ActiveToggle } from "./client-controls";
import { ChatRoom } from "./chat-room";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

/**
 * /agent/team — Tím chat + Workload (admin only) v dvoch taboch.
 *
 *   Default tab = chat (všetci useri)
 *   Workload tab = len admin (alebo v dev pre testovanie)
 */
export default async function TeamPage({ searchParams }: Props) {
  const params = await searchParams;
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const isAdminOrDev =
    me.role === "admin" || process.env.NODE_ENV !== "production";
  const tab: "chat" | "workload" =
    params.tab === "workload" && isAdminOrDev ? "workload" : "chat";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Users className="w-6 h-6 text-sky-500" aria-hidden />
          Tím
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Chat tímu + (pre admina) prehľad vyťaženia obchodníkov.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <TabLink
          href="/agent/team"
          active={tab === "chat"}
          icon={<MessageCircle className="w-4 h-4" aria-hidden />}
          label="Chat"
        />
        {isAdminOrDev && (
          <TabLink
            href="/agent/team?tab=workload"
            active={tab === "workload"}
            icon={<Users className="w-4 h-4" aria-hidden />}
            label="Workload"
          />
        )}
      </div>

      {tab === "chat" ? <ChatTab me={me} /> : <WorkloadTab />}
    </div>
  );
}

function TabLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors",
        active
          ? "bg-foreground text-background shadow-sm"
          : "bg-background border hover:border-foreground/30 hover:bg-muted/40",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

async function ChatTab({
  me,
}: {
  me: { id: string; role: "admin" | "user" };
}) {
  const initialMessages = await loadChatHistory();
  return (
    <ChatRoom
      meId={me.id}
      meRole={me.role}
      initialMessages={initialMessages}
    />
  );
}

async function WorkloadTab() {
  const agents = await getTeamWorkload();
  const inactiveCount = agents.filter((a) => a.inactive_flag).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Capacity 0–10 určuje koľko leadov dostane (0 = pauzovaný, 5 = default,
        10 = top performer). Auto-assign vyberie usera s najnižším ratiom
        load/capacity.
      </p>

      {inactiveCount > 0 && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-3">
          <AlertCircle
            className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5"
            aria-hidden
          />
          <div>
            <h3 className="font-bold text-amber-900 dark:text-amber-200">
              {inactiveCount}{" "}
              {inactiveCount === 1
                ? "obchodník neaktívny"
                : "obchodníci neaktívni"}{" "}
              viac ako 48 hodín
            </h3>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Skontroluj že sú v poriadku. Ak na trvalo, prepni ich na inactive.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-3 font-bold">Obchodník</th>
              <th className="px-4 py-3 font-bold text-center">Capacity</th>
              <th className="px-4 py-3 font-bold text-center">
                Load (aktívne)
              </th>
              <th className="px-4 py-3 font-bold text-center">Spolu</th>
              <th className="px-4 py-3 font-bold">Posledná aktivita</th>
              <th className="px-4 py-3 font-bold text-center">Aktívny</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const ratio =
                a.capacity > 0 ? a.active_leads / a.capacity : Infinity;
              const ratioPct = Math.min(100, Math.round(ratio * 50));
              const ratioColor =
                ratio >= 1.5
                  ? "bg-red-500"
                  : ratio >= 1
                    ? "bg-amber-500"
                    : "bg-emerald-500";
              return (
                <tr
                  key={a.id}
                  className="border-t last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.email}
                      {a.role === "admin" && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold uppercase tracking-wider">
                          admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.role === "user" ? (
                      <CapacityControl userId={a.id} initial={a.capacity} />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <div className="font-bold">
                        {a.active_leads}
                        {a.capacity > 0 && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            / {a.capacity}
                          </span>
                        )}
                      </div>
                      {a.capacity > 0 && (
                        <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${ratioColor} transition-all`}
                            style={{ width: `${ratioPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {a.total_leads}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          a.inactive_flag
                            ? "text-amber-700 dark:text-amber-400 font-semibold"
                            : "text-muted-foreground"
                        }
                      >
                        {formatInactive(a.inactive_hours)}
                      </span>
                      {a.inactive_flag && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold uppercase">
                          <AlertCircle className="w-3 h-3" aria-hidden />
                          48h+
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ActiveToggle userId={a.id} initial={a.active} />
                  </td>
                </tr>
              );
            })}
            {agents.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  Žiadni obchodníci.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
