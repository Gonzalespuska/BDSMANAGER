import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Camera,
  CheckCheck,
  ClipboardList,
  Droplets,
  MapPin,
  Phone,
  Ruler,
  Sparkles,
  StickyNote,
  Zap,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/app-shell";
import { loadNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { formatPhoneSK } from "@/lib/phone-format";

import { SafePhoto } from "@/components/safe-photo";
import { JustSentBanner } from "./just-sent-banner";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /obhliadnute — Dashboard obchodáka pre HOTOVÉ obhliadky.
 *
 * Obhliadkár klikol „Odoslať obhliadku" → lead prešiel na status='inspected'
 * → obchodák tu vidí:
 *   • základné info o klientovi (meno, telefón, m², lokalita)
 *   • výsledky testov (vlhkosť, odtrh)
 *   • m² z presného zamerania obhliadkára
 *   • fotky z foto-guide
 *   • poznámku obhliadkára (voliteľná)
 *
 * A môže:
 *   • otvoriť generátor ponuky (predvyplnené m² + typ)
 *   • otvoriť lead detail
 *   • napísať obhliadkárovi (💬 Napísať)
 *   • označiť lost (klient odmietol)
 *
 * Zámerne to NIE JE súčasť /agent (Leady) — tie sú „nové" leady na volanie.
 * Obhliadnuté je vlastná pracovná fronta.
 */
export default async function ObhliadnutePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; justSent?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  if (user.role !== "obchod" && user.role !== "admin") {
    const { dashboardPathForRole } = await import("@/lib/roles");
    redirect(dashboardPathForRole(user.role));
  }

  const sp = await searchParams;
  const activeTab: "caka" | "finalna" =
    sp.tab === "finalna" ? "finalna" : "caka";

  // Ak user práve poslal CP, tab=finalna param je set + justSent=<leadId>.
  // Načítame meno pre banner.
  let justSentName: string | null = null;
  if (sp.justSent) {
    try {
      const admin = createAdminClient();
      const { data: l } = await admin
        .from("leads")
        .select("name")
        .eq("id", sp.justSent)
        .maybeSingle();
      justSentName = (l?.name as string) ?? null;
    } catch {
      /* ignore */
    }
  }

  const sb = createAdminClient();

  // Dva tabby:
  //   • "Čaká na CP" — status='inspected' — čerstvo obhliadnuté, môj krok
  //   • "Finálna CP ✅" — status='quote_sent' — už poslaná CP, archív
  // Won/lost/archived nezobrazujeme (finálne stavy — patria do /agent).
  const targetStatus = activeTab === "finalna" ? "quote_sent" : "inspected";
  const baseQuery = sb
    .from("leads")
    .select("*")
    .eq("status", targetStatus)
    .not("inspection_result", "is", null)
    .order("last_activity_at", { ascending: false })
    .limit(100);
  const q =
    user.role === "admin" ? baseQuery : baseQuery.eq("assigned_to", user.id);
  const { data: leadsRaw } = await q;
  const leads = leadsRaw ?? [];

  // Counts pre tab bedge — koľko čaká na CP vs. koľko je hotových
  const countQ = (status: string) => {
    const b = sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", status)
      .not("inspection_result", "is", null);
    return user.role === "admin" ? b : b.eq("assigned_to", user.id);
  };
  const [{ count: countCaka }, { count: countFinalna }] = await Promise.all([
    countQ("inspected"),
    countQ("quote_sent"),
  ]);

  // Fotky pre všetky leady batch — public URL (bucket je public od 2026-07-11)
  const leadIds = leads.map((l) => l.id as string);
  const photosByLead: Map<string, { url: string; id: string }[]> = new Map();
  const inspectorMap: Map<string, { name: string; email: string }> = new Map();
  if (leadIds.length > 0) {
    const { data: mediaRaw } = await sb
      .from("inspection_media")
      .select("id, lead_id, storage_path")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });
    for (const m of mediaRaw ?? []) {
      const lid = m.lead_id as string;
      const { data: { publicUrl } } = sb.storage
        .from("inspection-media")
        .getPublicUrl(m.storage_path as string);
      if (!publicUrl) continue;
      if (!photosByLead.has(lid)) photosByLead.set(lid, []);
      photosByLead.get(lid)!.push({ url: publicUrl, id: m.id as string });
    }

    const inspectorIds = Array.from(
      new Set(
        leads
          .map((l) => (l as { inspection_by?: string }).inspection_by)
          .filter(Boolean) as string[],
      ),
    );
    if (inspectorIds.length > 0) {
      const { data: users } = await sb
        .from("users")
        .select("id, name, email")
        .in("id", inspectorIds);
      for (const u of users ?? []) {
        inspectorMap.set(u.id as string, {
          name: (u.name as string) ?? "",
          email: (u.email as string) ?? "",
        });
      }
    }
  }

  const notifications = await loadNotifications(user.id).catch(() => []);
  const selfPaused = user.capacity === 0;

  return (
    <AppShell
      user={user}
      selfPaused={selfPaused}
      notifications={notifications}
      wide
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2 flex-wrap">
            <CheckCheck className="w-6 h-6 text-emerald-600" aria-hidden />
            Obhliadnuté
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {activeTab === "caka"
              ? "Obhliadkár už bol na mieste, spísal testy + presné m² + fotky. Tvoj krok: pošli klientovi cenovú ponuku."
              : "Archív odoslaných CP — obhliadnuté s finálnou cenovou ponukou odoslanou klientovi."}
          </p>
        </header>

        {/* Tabs — Čaká na CP / Finálna CP */}
        <div className="inline-flex rounded-xl border-2 bg-background p-1 gap-1">
          <Link
            href="/obhliadnute"
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
              activeTab === "caka"
                ? "bg-rose-500 text-white shadow-sm"
                : "text-muted-foreground hover:bg-rose-50 hover:text-rose-700",
            )}
          >
            <Sparkles className="w-4 h-4" aria-hidden />
            Čaká na CP
            <span
              className={cn(
                "text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded",
                activeTab === "caka"
                  ? "bg-white/20"
                  : "bg-rose-100 text-rose-700",
              )}
            >
              {countCaka ?? 0}
            </span>
          </Link>
          <Link
            href="/obhliadnute?tab=finalna"
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors",
              activeTab === "finalna"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700",
            )}
          >
            <CheckCheck className="w-4 h-4" aria-hidden />
            Finálna CP ✅
            <span
              className={cn(
                "text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded",
                activeTab === "finalna"
                  ? "bg-white/20"
                  : "bg-emerald-100 text-emerald-700",
              )}
            >
              {countFinalna ?? 0}
            </span>
          </Link>
        </div>

        {leads.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed bg-background p-12 text-center">
            <Sparkles className="w-10 h-10 mx-auto text-emerald-400 mb-3" />
            <h3 className="text-lg font-bold">
              {activeTab === "caka"
                ? "Žiadne obhliadnuté nečakajú na CP"
                : "Zatiaľ žiadna finálna CP"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {activeTab === "caka"
                ? `Až obhliadkár klikne „Odoslať obhliadku" na priradenej obhliadke, lead sa zjaví tu s kompletnými dátami (testy, zameranie, fotky).`
                : "Ak pošleš klientovi cenovú ponuku, lead sa presunie sem ako archív."}
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {leads.map((l) => {
              const data = (l.data ?? {}) as Record<string, unknown>;
              const result =
                ((l as { inspection_result?: Record<string, unknown> })
                  .inspection_result ?? {}) as Record<string, unknown>;

              const m2 =
                (result.measured_m2 as number | undefined) ??
                (typeof data.plocha === "string"
                  ? parseFloat(data.plocha)
                  : (data.plocha as number | undefined));
              const shapes = (result.shapes as Array<{ label: string }>) ?? [];
              const moist1 = result.moisture_pct as number | undefined;
              const moist2 = result.moisture_pct_2 as number | undefined;
              const adhesion = result.adhesion_mpa as number | undefined;
              const agentNote = result.agent_note as string | undefined;
              const feasible = result.feasible !== false;
              const lokalita = (data.lokalita as string | undefined) ?? "—";
              const priestor = (data.priestor as string | undefined) ?? null;
              const typ = (data.typ_podlahy as string | undefined) ?? null;
              const photos = photosByLead.get(l.id as string) ?? [];
              const inspector = (l as { inspection_by?: string })
                .inspection_by
                ? inspectorMap.get(
                    (l as { inspection_by: string }).inspection_by,
                  )
                : null;
              const activityAt = l.last_activity_at
                ? new Date(l.last_activity_at as string).toLocaleString(
                    "sk-SK",
                    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
                  )
                : null;

              const isNew = l.status === "inspected"; // ešte neposlaná CP
              return (
                <li
                  key={l.id as string}
                  className={cn(
                    "rounded-2xl border-2 shadow-sm overflow-hidden transition-all",
                    isNew
                      ? "bg-white border-rose-300 shadow-rose-100/50 shadow-md ring-2 ring-rose-200/50"
                      : "bg-slate-50/70 border-slate-200 opacity-90",
                  )}
                >
                  {/* Header — meno klienta + status pill + čas */}
                  <div
                    className={cn(
                      "px-4 py-3 border-b flex items-center gap-3 flex-wrap",
                      isNew
                        ? "bg-gradient-to-r from-rose-50 via-emerald-50 to-sky-50"
                        : "bg-slate-100/60",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isNew && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-rose-500 text-white px-1.5 py-0.5 rounded animate-pulse">
                            ⚡ NOVÉ
                          </span>
                        )}
                        {!isNew && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-slate-400 text-white px-1.5 py-0.5 rounded">
                            ✉ CP odoslaná
                          </span>
                        )}
                        <div className="text-base md:text-lg font-black leading-tight truncate">
                          {l.name}
                        </div>
                      </div>
                      <div className="text-[11px] font-semibold text-muted-foreground inline-flex items-center gap-1.5 mt-0.5">
                        <MapPin className="w-3 h-3" aria-hidden />
                        {lokalita}
                        {activityAt && (
                          <>
                            <span className="mx-1">·</span>
                            {isNew ? "Obhliadnuté" : "CP poslaná"} {activityAt}
                          </>
                        )}
                      </div>
                    </div>
                    {feasible ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white px-2 py-1 rounded-full">
                        ✓ Realizovateľné
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white px-2 py-1 rounded-full">
                        ⛔ Neodporúča
                      </span>
                    )}
                  </div>

                  {/* Body — 3 stĺpce: kontakt+chipy | testy | fotky */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                    {/* Ľavý stĺpec: kontakt + chipy */}
                    <div className="space-y-2">
                      {l.phone && (
                        <a
                          href={`tel:${l.phone}`}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 text-emerald-800 px-3 py-1.5 text-sm font-black transition-colors"
                        >
                          <Phone className="w-4 h-4" />
                          {formatPhoneSK(l.phone as string)}
                        </a>
                      )}
                      <div className="flex flex-nowrap items-center gap-2 mt-2 overflow-x-auto scrollbar-hide">
                        {typeof m2 === "number" && m2 > 0 && (
                          <Chip
                            icon={<Ruler className="w-3.5 h-3.5" />}
                            label={`${m2.toFixed(2)} m²`}
                          />
                        )}
                        {lokalita && lokalita !== "—" && (
                          <Chip
                            icon={<MapPin className="w-3.5 h-3.5" />}
                            label={lokalita}
                          />
                        )}
                        {priestor && (
                          <Chip icon={<span>🏠</span>} label={priestor} />
                        )}
                        {typ && (
                          <Chip icon={<span>🎨</span>} label={typ} />
                        )}
                      </div>
                      {shapes.length > 1 && (
                        <div className="text-sm font-semibold text-slate-700 mt-3">
                          Zamerané v {shapes.length} tvaroch (atypika)
                        </div>
                      )}
                      {inspector &&
                        (l as { inspection_by?: string }).inspection_by && (
                          <div className="text-sm text-slate-700 mt-2 inline-flex items-center gap-1.5">
                            <span className="font-bold">Obhliadkár:</span>
                            <Link
                              href={`/profil/${(l as { inspection_by: string }).inspection_by}`}
                              className="font-black text-sky-700 hover:text-sky-900 hover:underline underline-offset-2 decoration-2"
                              title="Otvoriť profil obhliadkára"
                            >
                              {inspector.name}
                            </Link>
                          </div>
                        )}
                    </div>

                    {/* Stredný stĺpec: TESTY */}
                    <div className="space-y-2 rounded-xl bg-slate-50/60 border border-slate-200 p-3">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Testy podkladu
                      </div>
                      <TestRow
                        icon={<Droplets className="w-4 h-4 text-sky-500" />}
                        label="Vlhkosť"
                        value={
                          typeof moist1 === "number" &&
                          typeof moist2 === "number"
                            ? `${moist1}% / ${moist2}%`
                            : null
                        }
                        badge={
                          typeof moist1 === "number" &&
                          typeof moist2 === "number"
                            ? Math.max(moist1, moist2) <= 4
                              ? { label: "OK", tone: "emerald" }
                              : Math.max(moist1, moist2) <= 5
                                ? { label: "hraničné", tone: "amber" }
                                : { label: "vysoké", tone: "rose" }
                            : null
                        }
                      />
                      <TestRow
                        icon={<Zap className="w-4 h-4 text-amber-500" />}
                        label="Odtrh"
                        value={
                          typeof adhesion === "number"
                            ? `${adhesion} MPa`
                            : null
                        }
                        badge={
                          typeof adhesion === "number"
                            ? adhesion >= 1.5
                              ? { label: "štandard", tone: "emerald" }
                              : adhesion >= 1.0
                                ? { label: "hraničné", tone: "amber" }
                                : { label: "slabé", tone: "rose" }
                            : null
                        }
                      />
                    </div>

                    {/* Pravý stĺpec: FOTKY */}
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 inline-flex items-center gap-1 mb-1">
                        <Camera className="w-3 h-3" />
                        Fotky ({photos.length})
                      </div>
                      {photos.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic">
                          Bez fotiek
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5">
                          {photos.slice(0, 6).map((p) => (
                            <a
                              key={p.id}
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="aspect-square rounded-md overflow-hidden border hover:border-sky-400 transition-colors"
                            >
                              <SafePhoto url={p.url} />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Poznámka obhliadkára — VÝRAZNÁ. Obchodák si ju musí
                      všimnúť pred posielaním CP (napr. "prístup zo dvora
                      OK", "klient chce začať v septembri"). */}
                  {agentNote && agentNote !== "OK — pripravené na CP." && (
                    <div className="mx-4 mb-3 rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-amber-100/60 to-amber-50 p-4 shadow-sm">
                      <div className="text-xs font-black uppercase tracking-widest text-amber-800 inline-flex items-center gap-1.5 mb-2">
                        <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                          <StickyNote className="w-3.5 h-3.5" />
                        </div>
                        Poznámka od obhliadkára
                      </div>
                      <div className="text-base font-bold text-amber-950 leading-relaxed whitespace-pre-wrap pl-8">
                        „{agentNote}"
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div
                    className={cn(
                      "border-t px-4 py-3 flex items-center gap-2 flex-wrap",
                      isNew ? "bg-emerald-50/50" : "bg-slate-100/40",
                    )}
                  >
                    <Link
                      href={`/generator?lead=${l.id}`}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-black transition-colors shadow-sm",
                        isNew
                          ? "bg-sky-500 hover:bg-sky-600 text-white"
                          : "bg-slate-200 hover:bg-slate-300 text-slate-700",
                      )}
                    >
                      <Calculator className="w-4 h-4" />
                      {isNew ? "Poslať cenovú ponuku" : "Otvoriť ponuku znova"}
                    </Link>
                    {/* Poslať na realizáciu — LEN v "Finálna CP" tabe (isNew=false,
                        status='quote_sent'). Klient prijal CP → obchodák priradí
                        realizatora + dátum → status='in_realization'. */}
                    {!isNew && (
                      <Link
                        href={`/calendar?assign=realization&lead=${l.id}${lokalita !== "—" ? `&city=${encodeURIComponent(lokalita)}` : ""}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-black transition-colors shadow-sm"
                      >
                        <span>🔨</span>
                        Poslať na realizáciu
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    <Link
                      href={`/obhliadky/${l.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border-2 border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-2 text-sm font-bold transition-colors"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Otvoriť detail
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function Chip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  // Unified neutral chip — user "toto nemusi byt take farebne daj to vacsi
  // nech to je vzdy na jeden riadok". Menšie výrazný set farieb bol
  // distraktívny; slate-100 pozadie + dark slate text je čitateľnejšie
  // a nekonkuruje ostatným prvkom karty (testy, poznámka, fotky).
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border border-slate-200 bg-slate-100 text-slate-800 whitespace-nowrap shrink-0">
      {icon}
      {label}
    </span>
  );
}

function TestRow({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  badge:
    | { label: string; tone: "emerald" | "amber" | "rose" }
    | null;
}) {
  const badgeCls =
    badge?.tone === "emerald"
      ? "bg-emerald-100 text-emerald-800"
      : badge?.tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        {value ? (
          <div className="font-black text-slate-900">{value}</div>
        ) : (
          <div className="text-xs italic text-muted-foreground">Nezadané</div>
        )}
      </div>
      {badge && (
        <span
          className={cn(
            "text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
            badgeCls,
          )}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}
