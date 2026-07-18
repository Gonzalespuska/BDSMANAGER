import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Row = {
  id: number;
  source_id: string | null;
  endpoint: string;
  method: string;
  status: number;
  ip: string | null;
  user_agent: string | null;
  headers: Record<string, unknown> | null;
  body_preview: string | null;
  error: string | null;
  received_at: string;
};

export default async function WebhookLogPage() {
  const { unstable_noStore: noStore } = await import("next/cache");
  noStore();
  const sb = createAdminClient();
  const { data } = await sb
    .from("webhook_audit_log")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Row[];

  const { data: source } = await sb
    .from("lead_sources")
    .select("id, webhook_secret")
    .eq("id", "11111111-1111-1111-1111-111111111111")
    .maybeSingle();
  const expectedSecretPrefix = source?.webhook_secret
    ? source.webhook_secret.slice(0, 12) + "…"
    : "—";
  const expectedSecretLen = source?.webhook_secret?.length ?? 0;

  return (
    <div className="space-y-5">
      <header>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-3 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Späť na admin
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            📥 Webhook audit log
          </h1>
          <form>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-black px-3 py-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </form>
        </div>
      </header>

      <section className="rounded-xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/20 p-4 text-sm space-y-1">
        <div className="font-black text-sky-900 dark:text-sky-100">
          Web source (Epoxidovo.sk) očakávaný webhook secret:
        </div>
        <div className="font-mono text-xs">
          Prefix: <span className="text-emerald-700 dark:text-emerald-400">{expectedSecretPrefix}</span>{" "}
          · Length: <span className="text-emerald-700 dark:text-emerald-400">{expectedSecretLen}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Pri každom pokuse zaznamenávame prvých 12 znakov secretu čo epoxidovo.sk poslal.
          Ak vidíš rôzny prefix alebo length ako vyššie → epoxidovo.sk má nesprávny BDSMANAGER_WEBHOOK_SECRET env var.
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-10 text-center">
          <div className="font-black text-slate-700 dark:text-slate-300 text-lg mb-1">
            Zatiaľ žiadne záznamy
          </div>
          <div className="text-sm text-muted-foreground">
            Odošli formulár na epoxidovo.sk a refresh túto stránku. Ak sa tu
            nič neobjaví → epoxidovo.sk nevolá tento endpoint (env var chýba
            alebo je zle nastavený).
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <details
              key={r.id}
              className={
                "rounded-lg border-2 p-3 " +
                (r.status >= 200 && r.status < 300
                  ? "border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20"
                  : r.status === 401
                    ? "border-rose-300 bg-rose-50/30 dark:border-rose-800 dark:bg-rose-950/20"
                    : "border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20")
              }
            >
              <summary className="cursor-pointer flex items-center gap-2 flex-wrap">
                <span
                  className={
                    "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded " +
                    (r.status >= 200 && r.status < 300
                      ? "bg-emerald-200 text-emerald-800"
                      : r.status === 401
                        ? "bg-rose-200 text-rose-800"
                        : "bg-amber-200 text-amber-800")
                  }
                >
                  HTTP {r.status}
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {new Date(r.received_at).toLocaleString("sk-SK")}
                </span>
                <span className="font-mono text-[11px] text-slate-600 truncate">
                  {r.method} {r.endpoint}
                </span>
                {r.error && (
                  <span className="text-xs font-black text-rose-700 truncate">
                    {r.error}
                  </span>
                )}
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="font-black text-slate-500">Source ID:</span>{" "}
                  <span className="font-mono">{r.source_id ?? "—"}</span>
                </div>
                <div>
                  <span className="font-black text-slate-500">IP:</span>{" "}
                  <span className="font-mono">{r.ip ?? "—"}</span>
                </div>
                <div>
                  <span className="font-black text-slate-500">User agent:</span>{" "}
                  <span className="font-mono break-all">{r.user_agent ?? "—"}</span>
                </div>
                <div>
                  <span className="font-black text-slate-500">Headers:</span>
                  <pre className="bg-slate-900 text-slate-100 rounded p-2 mt-1 overflow-x-auto text-[11px]">
                    {JSON.stringify(r.headers, null, 2)}
                  </pre>
                </div>
                <div>
                  <span className="font-black text-slate-500">Body preview:</span>
                  <pre className="bg-slate-900 text-slate-100 rounded p-2 mt-1 overflow-x-auto text-[11px] whitespace-pre-wrap break-all">
                    {r.body_preview || "<empty>"}
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
