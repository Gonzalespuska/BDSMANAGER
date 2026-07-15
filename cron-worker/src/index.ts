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
  /** ntfy.sh topic pre alert push notifikácie (napr. sync fail 3× v rade). */
  NTFY_ALERT_TOPIC?: string;
  /**
   * KV binding pre tracking sync failure streak. Ak KV nie je bound,
   * alarm sa preskočí (soft-fail). Setup v wrangler.toml + `wrangler kv:namespace create sync_state`.
   */
  SYNC_STATE?: KVNamespace;
}

// Prahové hodnoty pre liveness alarm
const FAIL_STREAK_ALERT = 3; // 3× v rade fail (15 min) → alarm
const ZERO_LEAD_HOURS = 6; // 0 web leadov za 6h počas business hours → alarm
const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 20;

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

  // ─── LIVENESS ALARM (User 2026-07-15) ───────────────────────────────
  // Ak sync padne 3× v rade → push notif na mobil aby sa problém včas
  // zachytil (predtým sme 4 dni ani nevedeli, že cron padá na "column
  // termin does not exist").
  await checkSyncLiveness(env, web);

  // ─── ZERO-LEAD ALARM ────────────────────────────────────────────────
  // Aj keď sync vracia 200, môže byť infrastructure problem (webhook na
  // strane epoxidovo.sk odpadol, doména nefunguje, cache issue). Ak za
  // 6h počas business hours (8-20 SK) neprišiel žiadny web lead → push.
  await checkLeadFlow(env);

  return { ok: true, web, meta, transition };
}

async function checkLeadFlow(env: Env): Promise<void> {
  if (!env.NTFY_ALERT_TOPIC || !env.SYNC_STATE || !env.TARGET_URL) return;
  const flowCheckUrl = env.TARGET_URL.replace(
    "/api/cron/sync-epoxidovo",
    "/api/cron/lead-flow-check",
  );
  try {
    const r = await fetch(flowCheckUrl, {
      method: "POST",
      headers: { "X-Cron-Secret": env.CRON_SECRET },
    });
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      alert?: boolean;
      reason?: string;
      web_leads_6h?: number;
    };
    if (!j.ok) return;
    const key = "lead_flow_alerted_at";
    const lastAlerted = await env.SYNC_STATE.get(key);
    const nowMs = Date.now();
    if (j.alert) {
      // Rate-limit — max 1 alert per hour (aby sme neSPAMOVALI keď
      // stav pretrváva 3h+).
      if (lastAlerted && nowMs - parseInt(lastAlerted, 10) < 3600_000) return;
      await env.SYNC_STATE.put(key, String(nowMs), { expirationTtl: 7200 });
      await ntfyPush(
        env.NTFY_ALERT_TOPIC,
        "⚠️ 0 web leadov za 6h",
        `Business hours idú, ale za posledných 6h neprišiel žiadny web lead z epoxidovo.sk.\n\nMožné príčiny:\n• Sync funguje, ale zákazníci nevypĺňajú formulár (kampaň?)\n• epoxidovo.sk formulár rozbitý\n• DNS / SSL issue na najcrm.sk\n\nSkontroluj + potvrď.`,
        "high",
        "warning",
      );
    } else if (lastAlerted) {
      // Recovery
      await env.SYNC_STATE.delete(key);
      await ntfyPush(
        env.NTFY_ALERT_TOPIC,
        "✅ Web leady zase tečú",
        `Alert vyriešený — nový web lead prišiel. web_leads_6h: ${j.web_leads_6h ?? "?"}`,
        "default",
        "white_check_mark",
      );
    }
  } catch (e) {
    console.warn("[cron-worker] lead-flow-check failed:", e);
  }
}

/**
 * Zvýš failure streak counter v KV. Ak dosiahne prah → push push cez ntfy.sh.
 * Ak sync succes (status 200 + ok:true) → resetni counter.
 */
async function checkSyncLiveness(
  env: Env,
  webResult: { status?: number; body?: unknown; error?: string; skipped?: string },
): Promise<void> {
  if (!env.SYNC_STATE || !env.NTFY_ALERT_TOPIC) {
    // KV / topic nenakonfigurovaný — soft-skip (backward-compat).
    return;
  }
  const isSuccess =
    webResult.status === 200 &&
    !!(webResult.body as { ok?: boolean } | undefined)?.ok;

  const key = "sync_fail_streak";
  const currentRaw = await env.SYNC_STATE.get(key);
  const current = currentRaw ? parseInt(currentRaw, 10) : 0;

  if (isSuccess) {
    // Reset streak
    if (current > 0) {
      await env.SYNC_STATE.delete(key);
      console.log(`[cron-worker] sync recovered after ${current} fails`);
      if (current >= FAIL_STREAK_ALERT) {
        await ntfyPush(
          env.NTFY_ALERT_TOPIC,
          "✅ Sync obnovený",
          `Web sync epoxidovo.sk už funguje. (Padal ${current}× za sebou.)`,
          "default",
          "white_check_mark",
        );
      }
    }
    return;
  }

  // Fail — increment
  const next = current + 1;
  await env.SYNC_STATE.put(key, String(next), { expirationTtl: 3600 });

  const errMsg =
    (webResult.body as { error?: string; detail?: string } | undefined)?.detail ??
    (webResult.body as { error?: string } | undefined)?.error ??
    webResult.error ??
    `HTTP ${webResult.status}`;

  console.warn(`[cron-worker] sync fail #${next}: ${errMsg}`);

  if (next === FAIL_STREAK_ALERT) {
    await ntfyPush(
      env.NTFY_ALERT_TOPIC,
      "🚨 SYNC PADÁ 3× ZA SEBOU",
      `Web sync epoxidovo.sk padá:\n${errMsg}\n\nNové leady sa NEDOSTÁVAJÚ do CRM. Skontroluj sync-epoxidovo/route.ts + Neon schemu.`,
      "max",
      "rotating_light",
    );
  } else if (next % 10 === 0) {
    // Po 10, 20, 30 fails znova pripomeň
    await ntfyPush(
      env.NTFY_ALERT_TOPIC,
      `🚨 Sync padá už ${next}× v rade`,
      `Stále nefunguje:\n${errMsg}`,
      "high",
      "rotating_light",
    );
  }
}

async function ntfyPush(
  topic: string,
  title: string,
  message: string,
  priority: "default" | "high" | "max" = "default",
  tag = "warning",
): Promise<void> {
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      headers: {
        Title: title,
        Priority: priority,
        Tags: tag,
      },
      body: message,
    });
  } catch (e) {
    console.warn("[cron-worker] ntfy push failed:", e);
  }
}
