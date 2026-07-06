import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Plug,
} from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

import { SyncEpoxidovoButton } from "./sync-button";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/integracie — Health dashboard pre lead webhook integrácie.
 *
 * Ukáže pre každý source (web, FB, IG, Google):
 *   - Source v DB aktívny?
 *   - Webhook URL (čo treba dať do externej platformy)
 *   - Posledný prijatý lead (kedy)
 *   - Počet leadov za 30 / 7 / 1 deň
 *   - ENV var status (Meta tokens, atď.)
 *
 * Cieľ: admin vidí na jednom mieste prečo "leady nechodia" a čo treba klikať.
 */
export default async function IntegrationsPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const sb = createAdminClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.najcrm.sk";

  // 1) Sources
  const { data: sourcesRaw } = await sb
    .from("lead_sources")
    .select("id, type, name, active, webhook_secret")
    .order("type");
  const sources = sourcesRaw ?? [];

  // 2) Lead counts per source za 30d / 7d / 1d
  const now = Date.now();
  const since30 = new Date(now - 30 * 86400_000).toISOString();
  const since7 = new Date(now - 7 * 86400_000).toISOString();
  const since1 = new Date(now - 1 * 86400_000).toISOString();

  const { data: recentLeads } = await sb
    .from("leads")
    .select("source_id, source_type, created_at")
    .gte("created_at", since30);

  const counts: Record<string, { d30: number; d7: number; d1: number; last: string | null }> = {};
  for (const s of sources) {
    counts[s.id] = { d30: 0, d7: 0, d1: 0, last: null };
  }
  for (const l of recentLeads ?? []) {
    const key = l.source_id;
    if (!key || !counts[key]) continue;
    counts[key].d30++;
    if (l.created_at >= since7) counts[key].d7++;
    if (l.created_at >= since1) counts[key].d1++;
    if (!counts[key].last || l.created_at > counts[key].last!) {
      counts[key].last = l.created_at;
    }
  }

  // 3) Env var status (server-side check; ak chýba → integration fails)
  const envStatus = {
    META_WEBHOOK_VERIFY_TOKEN: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    META_PAGE_ACCESS_TOKEN: !!process.env.META_PAGE_ACCESS_TOKEN,
    // META_APP_SECRET = HMAC verification pre POST leadgen calls.
    // Bez neho fungujú leady ale endpoint je viacej náchylný na spoofing
    // (anyone with URL môže POSTnúť fake leadgen_id, my fetchneme Graph API).
    META_APP_SECRET: !!process.env.META_APP_SECRET,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    SUPABASE_SECRET_KEY: !!process.env.SUPABASE_SECRET_KEY,
  };

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <Plug className="w-6 h-6 text-sky-500" aria-hidden />
          Integrácie — health
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status lead webhook zdrojov + env premenných. Ak niektorý zdroj má 0
          leadov za 30 dní, integrácia je rozbitá → nasleduj návod nižšie.
        </p>
      </header>

      {/* MANUAL SYNC BUTTON */}
      <SyncEpoxidovoButton />

      {/* ENV STATUS */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Server env premenné
        </h2>
        <div className="rounded-2xl border bg-background divide-y">
          {Object.entries(envStatus).map(([name, ok]) => (
            <div
              key={name}
              className="px-4 py-2.5 flex items-center justify-between gap-3"
            >
              <code className="font-mono text-xs">{name}</code>
              {ok ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" aria-hidden />
                  Nastavené
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-rose-700 text-xs font-bold">
                  <AlertCircle className="w-4 h-4" aria-hidden />
                  CHÝBA
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Editácia: Cloudflare Dashboard → Pages → bdsmanagerr → Settings →
          Environment variables (Production). Po pridaní treba redeploy.
        </p>
      </section>

      {/* LEAD SOURCES */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Lead zdroje + posledné aktívne
        </h2>
        <div className="space-y-3">
          {sources.map((s) => {
            const c = counts[s.id] ?? { d30: 0, d7: 0, d1: 0, last: null };
            const webhookUrl = `${baseUrl}/api/webhook/lead/${s.id}`;
            const isBroken = c.d30 === 0;
            return (
              <div
                key={s.id}
                className={cn(
                  "rounded-2xl border-2 p-4 space-y-3",
                  isBroken
                    ? "border-rose-200 bg-rose-50/30"
                    : "border-emerald-200 bg-emerald-50/30",
                )}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-bold inline-flex items-center gap-2">
                      {isBroken ? "🔴" : "🟢"} {s.name}
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {s.type}
                      </span>
                    </h3>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      ID:{" "}
                      <code className="font-mono">{s.id}</code>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      Aktívnych za 30 / 7 / 1 deň
                    </div>
                    <div className="text-base font-bold tabular-nums">
                      {c.d30} / {c.d7} / {c.d1}
                    </div>
                    {c.last && (
                      <div className="text-[11px] text-muted-foreground">
                        Posledný: {new Date(c.last).toLocaleString("sk-SK")}
                      </div>
                    )}
                  </div>
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer font-bold text-sky-700 hover:text-sky-900">
                    Webhook URL + secret pre externé integrácie
                  </summary>
                  <div className="mt-2 space-y-2 pl-3 border-l-2 border-sky-200">
                    <div>
                      <div className="font-bold text-muted-foreground mb-0.5">
                        URL (POST):
                      </div>
                      <code className="block font-mono text-[11px] bg-background border rounded p-1.5 break-all">
                        {webhookUrl}
                      </code>
                    </div>
                    {s.webhook_secret && (
                      <div>
                        <div className="font-bold text-muted-foreground mb-0.5">
                          Header <code>X-Webhook-Secret</code>:
                        </div>
                        <code className="block font-mono text-[11px] bg-background border rounded p-1.5 break-all">
                          {s.webhook_secret}
                        </code>
                      </div>
                    )}
                  </div>
                </details>

                {isBroken && (
                  <div className="text-xs bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-900">
                    <strong>0 leadov za 30 dní</strong> —{" "}
                    {sourceFixHint(s.type)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Meta webhook docs */}
      <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5 space-y-2">
        <h2 className="font-bold text-sky-900 inline-flex items-center gap-2">
          <ExternalLink className="w-5 h-5" aria-hidden />
          Setup checklist — Meta Lead Ads (FB + IG)
        </h2>
        <ol className="text-sm text-sky-900 list-decimal ml-5 space-y-1.5">
          <li>
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-bold"
            >
              Meta Developer Dashboard
            </a>{" "}
            → My Apps → Your App
          </li>
          <li>
            Webhooks → <code>Page</code> → Subscribe to{" "}
            <code>leadgen</code> field
          </li>
          <li>
            Callback URL:{" "}
            <code className="font-mono bg-background px-1 py-0.5 rounded">
              {baseUrl}/api/webhook/meta-leads
            </code>
          </li>
          <li>
            Verify Token: rovnaký ako env <code>META_WEBHOOK_VERIFY_TOKEN</code>
          </li>
          <li>
            Pridaj reálnu FB Page do app cez Page Access Token (Graph API
            Explorer)
          </li>
          <li>
            Setup IG Lead Ads: Business Suite → Integrations → Webhooks → IG
            tiež subscribe na <code>leadgen</code>
          </li>
          <li>
            <strong>HMAC signature (recommended):</strong> nastav{" "}
            <code>META_APP_SECRET</code> env var v Cloudflare Pages → bdsmanagerr
            → Settings → Environment Variables (Production). Hodnota = App
            Secret z Meta Developer Dashboard → Settings → Basic → App Secret.
            Bez tohto secret-u endpoint stále funguje, ale POST je menej chránený
            proti spoofing (HMAC sig sa neoveruje).
          </li>
        </ol>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5 space-y-2">
        <h2 className="font-bold text-sky-900 inline-flex items-center gap-2">
          <ExternalLink className="w-5 h-5" aria-hidden />
          Setup checklist — Web webhook (epoxidovo.sk)
        </h2>
        <ol className="text-sm text-sky-900 list-decimal ml-5 space-y-1.5">
          <li>Cloudflare Pages → epoxidovoweb projekt → Settings → Environment Variables</li>
          <li>
            Pridaj <code>BDSMANAGER_WEBHOOK_URL</code> = webhook URL pre
            web_webhook source (kopíruj zo zoznamu hore)
          </li>
          <li>
            Pridaj <code>BDSMANAGER_WEBHOOK_SECRET</code> = secret pre ten istý
            source
          </li>
          <li>
            Redeploy epoxidovoweb (Settings → Deployments → Retry / nový
            commit)
          </li>
          <li>
            Otestuj odoslaním reálneho leadu cez kontaktný formulár na
            epoxidovo.sk — mali by sa hneď zjaviť tu v admin/integracie pri
            "Epoxidovo.sk — kontaktný formulár"
          </li>
        </ol>
      </section>
    </div>
  );
}

function sourceFixHint(type: string): string {
  switch (type) {
    case "web_webhook":
      return "Skontroluj BDSMANAGER_WEBHOOK_URL na epoxidovo.sk Cloudflare Pages env vars. Form code v src/app/api/lead/route.ts forwarduje IBA ak je tá premenná set.";
    case "facebook":
    case "instagram":
      return "Meta Developer Dashboard → Webhooks → leadgen subscribe musí mať správny verify token a callback URL. Bez META_WEBHOOK_VERIFY_TOKEN env nikdy nebude verify handshake fungovať.";
    case "google":
      return "Google Ads Lead Form Extensions → Webhook Adapter. Konfigurácia v Google Ads dashboard, nie v Search Console.";
    default:
      return "Externá integrácia tu nie je nakonfigurovaná, alebo posiela na zlý URL.";
  }
}
