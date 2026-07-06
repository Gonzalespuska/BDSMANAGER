/**
 * Cloudflare Cron Worker — periodicky triggerne epoxidovo.sk → CRM sync.
 *
 * Beží ako samostatný Worker (nie Pages Function) lebo Pages nemá natívny
 * cron support. Deploy cez `wrangler deploy` v tomto priečinku.
 *
 * Cron: každých 5 minút
 *
 * Env vars (nastavené cez wrangler secret put):
 *   CRON_SECRET — musí sedieť s CRON_SECRET v bdsmanagerr Pages env
 *
 * Vars (v wrangler.toml):
 *   TARGET_URL — https://app.najcrm.sk/api/cron/sync-epoxidovo
 */

export interface Env {
  CRON_SECRET: string;
  TARGET_URL: string;
  META_TARGET_URL: string;
  /** URL na auto_transition_inspected endpoint — CP → Obhliadnutý po termíne. */
  AUTO_TRANSITION_URL?: string;
}

export default {
  /**
   * Scheduled event handler — CF Workers cron ho volá podľa `[triggers.crons]`.
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runSync(env, event.scheduledTime));
  },

  /**
   * Fetch handler — pre manuálne triggerovanie cez URL (voliteľné).
   * GET https://bdsmanager-cron.<subdomain>.workers.dev → spustí sync.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const result = await runSync(env, Date.now());
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

async function runSync(
  env: Env,
  scheduledTime: number,
): Promise<{ ok: boolean; web: unknown; meta: unknown; transition: unknown }> {
  const startedAt = new Date(scheduledTime).toISOString();
  console.log(`[cron-worker] Triggering all syncs at ${startedAt}`);

  // Default fallback URL — ak AUTO_TRANSITION_URL nie je v env
  const autoTransitionUrl =
    env.AUTO_TRANSITION_URL ||
    (env.TARGET_URL
      ? env.TARGET_URL.replace(
          "/api/cron/sync-epoxidovo",
          "/api/cron/auto-transition",
        )
      : null);

  // Web + Meta + auto-transition paralelne
  const [webRes, metaRes, transitionRes] = await Promise.allSettled([
    fetch(env.TARGET_URL, {
      method: "POST",
      headers: { "X-Cron-Secret": env.CRON_SECRET },
    }),
    env.META_TARGET_URL
      ? fetch(env.META_TARGET_URL, {
          method: "POST",
          headers: { "X-Cron-Secret": env.CRON_SECRET },
        })
      : Promise.resolve(null),
    autoTransitionUrl
      ? fetch(autoTransitionUrl, {
          method: "POST",
          headers: { "X-Cron-Secret": env.CRON_SECRET },
        })
      : Promise.resolve(null),
  ]);

  async function parseRes(r: PromiseSettledResult<Response | null>) {
    if (r.status === "rejected") return { error: String(r.reason) };
    if (!r.value) return { skipped: "no_url" };
    const body = await r.value.json().catch(() => ({ error: "non_json" }));
    return { status: r.value.status, body };
  }

  const web = await parseRes(webRes);
  const meta = await parseRes(metaRes);
  const transition = await parseRes(transitionRes);
  console.log("[cron-worker] web:", JSON.stringify(web));
  console.log("[cron-worker] meta:", JSON.stringify(meta));
  console.log("[cron-worker] transition:", JSON.stringify(transition));

  return { ok: true, web, meta, transition };
}
