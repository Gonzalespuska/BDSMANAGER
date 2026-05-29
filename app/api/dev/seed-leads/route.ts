import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * GET /api/dev/seed-leads
 *
 * Vygeneruje 8 sample leadov cez webhook endpoint — rôzne zdroje, statusy,
 * priority a typy dopytov. Nech máš čo zobrazovať v agent dashboarde.
 *
 * Idempotentné nie je — pri každom volaní pridá ďalších 8. Vymaž ich SQL-om
 * keď budeš mať dosť: `DELETE FROM leads;`
 *
 * DEV-only — v production NODE_ENV='production' vráti 403.
 */

interface SampleLead {
  source_id: string;
  secret: string;
  body: {
    name: string;
    phone?: string;
    email?: string;
    source_campaign?: string;
    priority?: "low" | "medium" | "high";
    value_estimate?: number;
    data?: Record<string, unknown>;
  };
}

const SAMPLES: SampleLead[] = [
  // ─── Web (Epoxidovo.sk kontaktný formulár) ───────────────────────────
  {
    source_id: "11111111-1111-1111-1111-111111111111",
    secret: "dev_secret_web_form",
    body: {
      name: "Barbora Dornič",
      phone: "+421 911 556 006",
      email: "barbora.dornic@example.sk",
      source_campaign: "Cenová ponuka — garáže",
      priority: "high",
      value_estimate: 1800,
      data: {
        plocha: "35",
        priestor: "Garáž",
        typ_podlahy: "Chipsová",
        lokalita: "Bratislava",
        termin: "Do 6 mesiacov",
        message:
          "Sedo-strieborná farba, ideálne s motívom znaku Mitsubishi v strede.",
      },
    },
  },
  {
    source_id: "11111111-1111-1111-1111-111111111111",
    secret: "dev_secret_web_form",
    body: {
      name: "Martin Krajčovič",
      phone: "+421 905 234 567",
      email: "martin.k@example.sk",
      source_campaign: "Cenová ponuka",
      priority: "medium",
      value_estimate: 4200,
      data: {
        plocha: "85",
        priestor: "Sklad",
        typ_podlahy: "Jednofarebná",
        lokalita: "Žilina",
        termin: "Do 3 mesiacov",
        message: "Potrebujeme rýchlu realizáciu, sklad sa otvára v septembri.",
      },
    },
  },
  // ─── Facebook Lead Ads ───────────────────────────────────────────────
  {
    source_id: "22222222-2222-2222-2222-222222222222",
    secret: "dev_secret_fb_ads",
    body: {
      name: "Daniela Hlinčíková",
      phone: "+421 948 143 981",
      source_campaign: "Garážové podlahy Bratislava",
      priority: "high",
      data: {
        plocha: "42",
        priestor: "Garáž — 2 autá",
        message: "Reakcia na video reklamu (epoxidová podlaha v garáži)",
      },
    },
  },
  {
    source_id: "22222222-2222-2222-2222-222222222222",
    secret: "dev_secret_fb_ads",
    body: {
      name: "Peter Kováč",
      phone: "+421 903 998 123",
      source_campaign: "Mramorové podlahy obývačka",
      priority: "low",
      data: {
        plocha: "25",
        priestor: "Obývačka",
        typ_podlahy: "Mramorová",
        lokalita: "Košice",
      },
    },
  },
  // ─── Instagram Lead Ads ──────────────────────────────────────────────
  {
    source_id: "33333333-3333-3333-3333-333333333333",
    secret: "dev_secret_ig_ads",
    body: {
      name: "Lucia Vargová",
      phone: "+421 911 778 442",
      email: "lucia.vargova@example.sk",
      source_campaign: "IG Reels — metalické podlahy",
      priority: "medium",
      data: {
        plocha: "18",
        priestor: "Kúpeľňa",
        typ_podlahy: "Metalická",
        lokalita: "Nitra",
        message: "Páčil sa mi video efekt zlato-čierna kombinácia.",
      },
    },
  },
  // ─── Google Ads Lead Form ────────────────────────────────────────────
  {
    source_id: "44444444-4444-4444-4444-444444444444",
    secret: "dev_secret_google",
    body: {
      name: "Jozef Mrázik",
      email: "jozef.mrazik@example.sk",
      source_campaign: "Search — epoxidové podlahy cena",
      priority: "medium",
      value_estimate: 2400,
      data: {
        plocha: "48",
        priestor: "Hala",
        lokalita: "Trnava",
        termin: "Tento mesiac",
      },
    },
  },
  {
    source_id: "44444444-4444-4444-4444-444444444444",
    secret: "dev_secret_google",
    body: {
      name: "Andrea Šimková",
      phone: "+421 919 445 102",
      email: "andrea.s@example.sk",
      source_campaign: "Search — podlaha do garáže",
      priority: "high",
      data: {
        plocha: "30",
        priestor: "Garáž",
        lokalita: "Banská Bystrica",
      },
    },
  },
  // ─── Manuálne pridaný (bez secret) ───────────────────────────────────
  {
    source_id: "55555555-5555-5555-5555-555555555555",
    secret: "",
    body: {
      name: "Marek Novák",
      phone: "+421 907 112 567",
      source_campaign: "Telefonický dopyt (admin pridal manuálne)",
      priority: "medium",
      data: {
        plocha: "60",
        priestor: "Dielňa",
        lokalita: "Prešov",
        message: "Volal priamo, požaduje cenovú ponuku.",
      },
    },
  },
];

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Disabled in production" },
      { status: 403 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";

  const results: Array<{
    name: string;
    source: string;
    ok: boolean;
    status: number;
    response: unknown;
  }> = [];

  for (const sample of SAMPLES) {
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (sample.secret) headers["X-Webhook-Secret"] = sample.secret;

      const res = await fetch(
        `${baseUrl}/api/webhook/lead/${sample.source_id}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(sample.body),
        },
      );
      const json = await res.json();
      results.push({
        name: sample.body.name,
        source: sample.source_id,
        ok: res.ok,
        status: res.status,
        response: json,
      });
    } catch (err) {
      results.push({
        name: sample.body.name,
        source: sample.source_id,
        ok: false,
        status: 0,
        response: { error: err instanceof Error ? err.message : "unknown" },
      });
    }
  }

  const successCount = results.filter((r) => r.ok).length;

  return NextResponse.json({
    ok: true,
    total: results.length,
    success: successCount,
    failed: results.length - successCount,
    results,
  });
}
