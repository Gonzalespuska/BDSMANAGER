import { Calendar as CalendarIcon, Clock, Construction } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /calendar — stub kalendárna stránka.
 *
 * Zatiaľ ukazuje nadchádzajúce naplánované callbacky (z lead.next_callback_at)
 * pre prihláseného agenta. Plný kalendár (mesiac/týždeň/deň view + drag-drop
 * eventy) sa nasadzuje v ďalšej fáze.
 */
export default async function CalendarPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const admin = createAdminClient();
  const { data: leads } = await admin
    .from("leads")
    .select("id, name, phone, email, next_callback_at, status, data")
    .eq("assigned_to", me.id)
    .not("next_callback_at", "is", null)
    .gte("next_callback_at", new Date().toISOString())
    .order("next_callback_at", { ascending: true })
    .limit(50);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <CalendarIcon className="w-6 h-6 text-sky-500" aria-hidden />
          Kalendár
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tvoje nadchádzajúce hovory a eventy. Každý agent vidí svoj.
        </p>
      </header>

      <div className="rounded-2xl border border-dashed border-sky-300 bg-sky-50 dark:bg-sky-950/30 p-4 inline-flex items-start gap-3">
        <Construction className="w-5 h-5 text-sky-700 dark:text-sky-300 mt-0.5 shrink-0" aria-hidden />
        <div className="text-sm text-sky-900 dark:text-sky-200">
          <strong>Stub verzia.</strong> Zatiaľ ukazuje len naplánované callbacky.
          V ďalšej fáze: mesiac/týždeň/deň view, drag &amp; drop eventy, vlastné
          stretnutia, prepojenie s leadmi.
        </div>
      </div>

      <section className="rounded-2xl border bg-background overflow-hidden">
        <header className="px-5 py-3 border-b bg-muted/40">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Nadchádzajúce callbacky ({leads?.length ?? 0})
          </h2>
        </header>
        {!leads || leads.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Žiadne naplánované hovory. Z karty leadu zvoľ &quot;Naplánovaný hovor&quot;
            a tu sa objaví.
          </div>
        ) : (
          <ul>
            {leads.map((l) => {
              const at = new Date(l.next_callback_at!);
              const dateLabel = at.toLocaleDateString("sk-SK", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              });
              const timeLabel = at.toLocaleTimeString("sk-SK", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li
                  key={l.id}
                  className="border-t first:border-t-0 px-5 py-3 hover:bg-muted/30"
                >
                  <a
                    href={`/agent/leads/${l.id}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold">{l.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {l.phone ?? l.email ?? "—"}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="inline-flex items-center gap-1.5 font-semibold text-sky-700 dark:text-sky-300">
                        <Clock className="w-3.5 h-3.5" aria-hidden />
                        {timeLabel}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {dateLabel}
                      </div>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
