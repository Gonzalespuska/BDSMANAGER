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
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const startedAt = new Date(scheduledTime).toISOString();
  console.log(`[cron-worker] Triggering sync at ${startedAt}`);

  const res = await fetch(env.TARGET_URL, {
    method: "POST",
    headers: {
      "X-Cron-Secret": env.CRON_SECRET,
      "Content-Type": "application/json",
    },
  });

  const body = await res
    .json()
    .catch(() => ({ error: "non_json_response" }));

  console.log(`[cron-worker] Sync response ${res.status}:`, JSON.stringify(body));
  return { ok: res.ok, status: res.status, body };
}
