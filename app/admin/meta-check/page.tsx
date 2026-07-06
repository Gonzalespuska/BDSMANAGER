import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2, CheckCircle2, AlertCircle } from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/meta-check — diagnostika META_PAGE_ACCESS_TOKEN.
 * Server-side hit na Graph API — vidíme aké Page má token, aké permissions,
 * aké lead forms sú dostupné. Podľa toho vieme či použijeme:
 *   A) Zapier (funguje s hocijakým tokenom)
 *   B) Native webhook (potrebuje leadgen subscription)
 *   C) Cron pull (potrebuje leads_retrieval permission)
 */
export default async function MetaCheckPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  let tokenInfo: unknown = null;
  let pages: unknown[] = [];
  let permissions: unknown[] = [];
  let leadForms: Array<{ page: string; forms: unknown[] }> = [];
  let error: string | null = null;

  if (token) {
    try {
      // 1) Kto je držiteľ tokenu (User alebo Page)?
      const meRes = await fetch(
        `https://graph.facebook.com/v22.0/me?fields=id,name,accounts{id,name,access_token,tasks}&access_token=${encodeURIComponent(token)}`,
      );
      tokenInfo = await meRes.json();

      // 2) Debug endpoint — čo je token, aké má scopes/perms
      const debugRes = await fetch(
        `https://graph.facebook.com/v22.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
      );
      const debugData = (await debugRes.json()) as {
        data?: { scopes?: string[]; type?: string; expires_at?: number };
      };
      permissions = debugData.data?.scopes ?? [];

      // 3) Pages token drží
      const meObj = tokenInfo as { accounts?: { data?: unknown[] } };
      pages = meObj.accounts?.data ?? [];

      // 4) Lead forms per page
      for (const p of pages as Array<{
        id: string;
        name: string;
        access_token: string;
      }>) {
        try {
          const formsRes = await fetch(
            `https://graph.facebook.com/v22.0/${p.id}/leadgen_forms?fields=id,name,status,leads_count&access_token=${encodeURIComponent(p.access_token)}`,
          );
          const formsData = (await formsRes.json()) as { data?: unknown[] };
          leadForms.push({ page: p.name, forms: formsData.data ?? [] });
        } catch (e) {
          leadForms.push({
            page: p.name,
            forms: [{ error: (e as Error).message }],
          });
        }
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const tokenObj = tokenInfo as {
    id?: string;
    name?: string;
    error?: { message: string; code: number };
  } | null;

  const permsSet = new Set(permissions as string[]);
  const hasLeadsRetrieval = permsSet.has("leads_retrieval");
  const hasPagesReadEng = permsSet.has("pages_read_engagement");
  const hasPagesManageAds =
    permsSet.has("pages_manage_ads") || permsSet.has("ads_management");

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Share2 className="w-6 h-6 text-blue-600" aria-hidden />
          Meta token — diagnostika
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overí čo tvoj `META_PAGE_ACCESS_TOKEN` vie robiť — aké Pages, aké lead
          forms, aké permissions. Podľa toho vyberieme integračnú cestu.
        </p>
      </header>

      {/* Token stav */}
      <section className="rounded-2xl border-2 p-4 bg-background space-y-3">
        <h2 className="font-bold text-base">🔑 Environment</h2>
        <div className="grid gap-2 text-sm">
          <EnvRow
            name="META_PAGE_ACCESS_TOKEN"
            set={!!token}
            hint="Long-lived Page Access Token z Graph Explorer alebo Business Suite"
          />
          <EnvRow
            name="META_WEBHOOK_VERIFY_TOKEN"
            set={!!verifyToken}
            hint="Náhodný string ktorý zdieľaš s Meta Dashboard pri subscription"
          />
        </div>
      </section>

      {!token && (
        <section className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4">
          <h2 className="font-bold text-rose-900 text-base inline-flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Token chýba
          </h2>
          <p className="text-sm text-rose-800 mt-2">
            Vygeneruj Page Access Token v Graph API Explorer alebo cez Meta
            Business Suite. Potom mi ho pošli a nastavím ho ako Cloudflare
            secret.
          </p>
        </section>
      )}

      {error && (
        <section className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4">
          <h2 className="font-bold text-rose-900 text-base">❌ Fetch failed</h2>
          <pre className="text-xs mt-2 whitespace-pre-wrap">{error}</pre>
        </section>
      )}

      {tokenObj?.error && (
        <section className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4">
          <h2 className="font-bold text-rose-900 text-base">
            ❌ Meta odmietla token (code {tokenObj.error.code})
          </h2>
          <p className="text-sm text-rose-800 mt-2">
            {tokenObj.error.message}
          </p>
          <p className="text-xs text-rose-700 mt-2 italic">
            Token je pravdepodobne expirovaný alebo revoknutý. Vygeneruj nový v
            Meta Business Suite → Settings → System Users.
          </p>
        </section>
      )}

      {tokenObj && !tokenObj.error && (
        <>
          <section className="rounded-2xl border bg-background p-4 space-y-2">
            <h2 className="font-bold text-base">✅ Token drží:</h2>
            <div className="text-sm">
              <span className="font-semibold">Meno:</span> {tokenObj.name}
            </div>
            <div className="text-sm">
              <span className="font-semibold">ID:</span> {tokenObj.id}
            </div>
          </section>

          <section className="rounded-2xl border bg-background p-4 space-y-2">
            <h2 className="font-bold text-base">🔐 Permissions (scopes)</h2>
            {(permissions as string[]).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Debug endpoint nič nevrátil — možno je token strict typu bez
                introspection.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(permissions as string[]).map((p) => (
                  <span
                    key={p}
                    className={cn(
                      "px-2 py-1 rounded font-mono font-bold border-2",
                      p === "leads_retrieval" ||
                        p === "pages_show_list" ||
                        p === "pages_read_engagement"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                        : "bg-slate-50 border-slate-300 text-slate-700",
                    )}
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
            <div className="grid gap-1 text-sm mt-2">
              <RequirementRow
                need="leads_retrieval"
                got={hasLeadsRetrieval}
                for_="Cron pull leadov + webhook download"
              />
              <RequirementRow
                need="pages_read_engagement"
                got={hasPagesReadEng}
                for_="Listing Page-ov + Lead Forms"
              />
              <RequirementRow
                need="pages_manage_ads"
                got={hasPagesManageAds}
                for_="Subscribe na leadgen event"
              />
            </div>
          </section>

          <section className="rounded-2xl border bg-background p-4 space-y-3">
            <h2 className="font-bold text-base">
              📄 Pages ({pages.length})
            </h2>
            {pages.length === 0 ? (
              <p className="text-sm text-amber-800 italic bg-amber-50 rounded p-3 border border-amber-200">
                ⚠️ Token nevie vypísať žiadne Page. Buď je to User token bez{" "}
                <code className="text-xs">pages_show_list</code>, alebo Page
                nie je pripojený k Business Manageru.
              </p>
            ) : (
              <ul className="text-sm space-y-1">
                {(
                  pages as Array<{
                    id: string;
                    name: string;
                    tasks?: string[];
                  }>
                ).map((p) => (
                  <li key={p.id} className="border rounded-lg p-2">
                    <div className="font-bold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      ID: {p.id}
                    </div>
                    {p.tasks && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Tasks: {p.tasks.join(", ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border bg-background p-4 space-y-3">
            <h2 className="font-bold text-base">📋 Lead Forms per Page</h2>
            {leadForms.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Zatiaľ nič — najprv treba prístup k Pages.
              </p>
            ) : (
              leadForms.map((pf, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="font-bold text-sm">📘 {pf.page}</div>
                  {pf.forms.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic mt-1">
                      Žiadne lead forms (alebo nemáme{" "}
                      <code>leads_retrieval</code> permission).
                    </div>
                  ) : (
                    <ul className="text-xs mt-2 space-y-1">
                      {(
                        pf.forms as Array<{
                          id?: string;
                          name?: string;
                          status?: string;
                          leads_count?: number;
                          error?: string;
                        }>
                      ).map((f, j) => (
                        <li
                          key={j}
                          className="flex items-center justify-between border-t pt-1 first:border-t-0 first:pt-0"
                        >
                          {f.error ? (
                            <span className="text-rose-700">{f.error}</span>
                          ) : (
                            <>
                              <div>
                                <span className="font-semibold">{f.name}</span>
                                <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                                  {f.id}
                                </span>
                              </div>
                              <div className="tabular-nums font-bold">
                                {f.leads_count ?? 0} leadov ·{" "}
                                <span
                                  className={cn(
                                    f.status === "ACTIVE"
                                      ? "text-emerald-700"
                                      : "text-slate-500",
                                  )}
                                >
                                  {f.status}
                                </span>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </section>
        </>
      )}

      <section className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 text-sm text-sky-950">
        <h2 className="font-bold text-base mb-2">👉 Na základe výsledku vyberieme:</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Ak sú Pages + Forms + leads_retrieval ✅</strong> → poviem
            "cron pull" — spravím worker ktorý every 5 min sťahuje nové leady
            cez Graph API. Autonómne, žiadny Zapier.
          </li>
          <li>
            <strong>Ak nemáš leads_retrieval</strong> → poviem "webhook" — dáš
            mi verify token, ja ho pushnem do CF, ty ho zadáš v Meta Dashboarde
            a klikneš Subscribe na leadgen.
          </li>
          <li>
            <strong>Ak token chýba/expired</strong> → potrebuješ vygenerovať
            nový v Business Suite.
          </li>
        </ul>
      </section>
    </div>
  );
}

function EnvRow({
  name,
  set,
  hint,
}: {
  name: string;
  set: boolean;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {set ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <div className="font-mono text-xs font-bold">
          {name}{" "}
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
              set
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800",
            )}
          >
            {set ? "SET" : "MISSING"}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground italic">{hint}</div>
      </div>
    </div>
  );
}

function RequirementRow({
  need,
  got,
  for_,
}: {
  need: string;
  got: boolean;
  for_: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {got ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
      ) : (
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      )}
      <code className="font-mono font-bold">{need}</code>
      <span className="text-muted-foreground">— potrebné pre: {for_}</span>
    </div>
  );
}
