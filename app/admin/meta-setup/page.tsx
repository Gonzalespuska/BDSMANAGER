import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/**
 * /admin/meta-setup — step-by-step ako nastaviť Meta OAuth tak aby
 * NIKDY nevyprsal.
 *
 * User 2026-07-15: „to preco je epired to co idem teraz kazdy tyzden
 * menit a medzi tym nepojdu leady den alebo co akoze ty amater".
 *
 * Trvalé riešenie = System User Access Token z Meta Business Manager
 * (technicky user, ktorý patrí business-u nie osobe → tokeny sú
 * dlho-lived / never-expire).
 */
export default async function MetaSetupPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3"
        >
          ← Späť na admin
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <KeyRound className="w-7 h-7 text-indigo-600" />
          Meta Setup — permanentný token
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Nastavenie Meta OAuth tak aby <b>NIKDY nevypršal</b> a Adriána-style
          incident sa už nezopakoval pre FB/IG lead ads.
        </p>
      </header>

      <div className="rounded-xl border-2 border-rose-300 bg-rose-50/40 p-4">
        <div className="inline-flex items-center gap-2 font-black text-rose-800 text-sm uppercase tracking-wider mb-2">
          <AlertTriangle className="w-5 h-5" />
          Problém dnes
        </div>
        <p className="text-sm text-rose-900 leading-relaxed">
          Aktuálny <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">META_PAGE_ACCESS_TOKEN</code>{" "}
          je pravdepodobne <b>User Access Token</b> ktorý vyprší za 60 dní. Náš
          cron sync volá <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">/me/accounts</code>{" "}
          → padá s{" "}
          <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">
            graph_me_accounts_failed
          </code>
          . Cez 60 dní by si musel manuálne generovať nový token a medzičasom
          <b> nefungujú Meta leady</b>.
        </p>
      </div>

      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-4">
        <div className="inline-flex items-center gap-2 font-black text-emerald-800 text-sm uppercase tracking-wider mb-2">
          <CheckCircle2 className="w-5 h-5" />
          Riešenie — System User Access Token
        </div>
        <p className="text-sm text-emerald-900 leading-relaxed">
          System User je technický používateľ patriaci Business Manager účtu
          (nie osobe). Jeho token <b>nikdy nevyprší</b> a nemá závislosť na
          konkrétnom človeku (napr. keď zamestnanec odíde).
        </p>
      </div>

      <Section title="Krok 1 — Meta Business Manager: vytvor System User">
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>
            Otvor{" "}
            <a
              href="https://business.facebook.com/settings/system-users"
              target="_blank"
              rel="noopener"
              className="text-sky-700 hover:underline inline-flex items-center gap-0.5 font-bold"
            >
              business.facebook.com/settings/system-users
              <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>Klikni <b>„Add"</b> → System User</li>
          <li>
            Meno: <code className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">Epoxidovo CRM Sync</code>
          </li>
          <li>Role: <b>Admin</b> (nie Employee — potrebujeme full API access)</li>
        </ol>
      </Section>

      <Section title="Krok 2 — Priraď Page k System User">
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>Klikni na novo-vytvorený System User</li>
          <li>Klikni <b>„Add Assets"</b> → Pages → vyber Epoxidovo Page</li>
          <li>
            Permissions: zaškrtni <b>Manage Page</b> (full control) — potrebné
            pre lead retrieval
          </li>
        </ol>
      </Section>

      <Section title="Krok 3 — Generuj Access Token">
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>
            V System User detaily klikni{" "}
            <b>„Generate New Token"</b>
          </li>
          <li>
            Vyber Meta App (Epoxidovo CRM). Ak nemáš, vytvor cez{" "}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener"
              className="text-sky-700 hover:underline font-bold inline-flex items-center gap-0.5"
            >
              developers.facebook.com/apps
              <ExternalLink className="w-3 h-3" />
            </a>{" "}
            (Type: Business)
          </li>
          <li>
            Scope-y (zaškrtni všetky):
            <ul className="list-disc ml-5 mt-1 space-y-0.5 font-mono text-xs">
              <li>pages_manage_metadata</li>
              <li>pages_read_engagement</li>
              <li>pages_show_list</li>
              <li>leads_retrieval</li>
              <li>ads_management</li>
              <li>business_management</li>
            </ul>
          </li>
          <li>
            <b>Expiration: „Never"</b> ← toto je celý zmysel System User Token
          </li>
          <li>Klikni <b>Generate</b> → skopíruj token (začína <code className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">EAA...</code>)</li>
        </ol>
      </Section>

      <Section title="Krok 4 — Zisti Page ID">
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>
            Otvor{" "}
            <a
              href="https://www.facebook.com/epoxidovo/about"
              target="_blank"
              rel="noopener"
              className="text-sky-700 hover:underline font-bold inline-flex items-center gap-0.5"
            >
              Epoxidovo Facebook Page → About
              <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>
            Scroll na <b>„Page ID"</b> (skopíruj číslo, napr.{" "}
            <code className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">
              123456789012345
            </code>
            )
          </li>
          <li>Ak máš viac Pages (napr. aj Instagram), skopíruj všetky ID</li>
        </ol>
      </Section>

      <Section title="Krok 5 — Nastav CF Pages secrets">
        <p className="text-sm mb-2">
          Na tvojom Macu spusti (nahradí sa existujúci token):
        </p>
        <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs font-mono overflow-x-auto">
{`cd /Users/puska/bdsmanager

# 1) Trvalý System User Access Token (nikdy nevyprší)
npx wrangler pages secret put META_PAGE_ACCESS_TOKEN \\
  --project-name=bdsmanagerr
# → paste token (EAA...)

# 2) Page IDs — kľúčové aby sme preskočili /me/accounts
npx wrangler pages secret put META_PAGE_IDS \\
  --project-name=bdsmanagerr
# → paste "123456789012345" (alebo comma-separated ak viac)

# 3) Trigger re-deploy aby sa env prepli
npx wrangler pages deployment tail --project-name=bdsmanagerr &
npm run pages:deploy`}
        </pre>
      </Section>

      <Section title="Krok 6 — Overenie">
        <ol className="list-decimal ml-5 space-y-2 text-sm">
          <li>
            Otvor{" "}
            <a
              href="https://bdsmanager-cron.gonzalespuska.workers.dev/"
              target="_blank"
              rel="noopener"
              className="text-sky-700 hover:underline font-bold inline-flex items-center gap-0.5"
            >
              cron worker live URL
              <ExternalLink className="w-3 h-3" />
            </a>
          </li>
          <li>
            V JSON response{" "}
            <code className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">
              meta.status
            </code>{" "}
            = <b>200</b> a{" "}
            <code className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">
              body.mode
            </code>{" "}
            = <code className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">"hardcoded_pages"</code>
          </li>
          <li>
            Ak vidíš{" "}
            <code className="px-1 py-0.5 bg-slate-100 rounded text-xs font-mono">
              graph_me_accounts_failed
            </code>{" "}
            → META_PAGE_IDS nie je nastavené, skontroluj krok 5
          </li>
        </ol>
      </Section>

      <div className="rounded-xl border-2 border-amber-300 bg-amber-50/60 p-4 text-sm">
        <div className="font-black text-amber-900 mb-1">
          💡 Alternatíva: Meta Real-Time Webhook
        </div>
        <p className="text-amber-900">
          Existuje endpoint{" "}
          <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">
            /api/webhook/meta-leads
          </code>{" "}
          — Meta pošle push priamo pri novom leade (nemusíme pollovat). Setup v
          Meta App Dashboard → Webhooks → Page → subscribe leadgen. Callback:{" "}
          <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">
            https://app.najcrm.sk/api/webhook/meta-leads
          </code>
          , Verify Token = env{" "}
          <code className="px-1 py-0.5 bg-white rounded text-xs font-mono">
            META_WEBHOOK_VERIFY_TOKEN
          </code>
          . Real-time = 0-sec gap.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border-2 border-slate-200 bg-white p-5">
      <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}
