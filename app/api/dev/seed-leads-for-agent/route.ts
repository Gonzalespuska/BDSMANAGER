export const runtime = "edge";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";

/**
 * GET /api/dev/seed-leads-for-agent?email=<agent-email>&count=10
 *
 * Vygeneruje N random leadov a všetky priradí konkrétnemu obchodákovi.
 * Bypasses auto-assign trigger — direct insert s assigned_to=<agent.id>.
 *
 * Použitie:
 *   curl 'http://localhost:3100/api/dev/seed-leads-for-agent?email=tristanvitaz8@gmail.com&count=10'
 *
 * DEV-only.
 */

const FIRST_NAMES = [
  "Barbora", "Martin", "Daniela", "Peter", "Lucia", "Jozef", "Andrea", "Marek",
  "Zuzana", "Tomáš", "Katarína", "Michal", "Lenka", "Juraj", "Monika", "Pavol",
  "Veronika", "Erik", "Simona", "Roman",
];
const LAST_NAMES = [
  "Dornič", "Krajčovič", "Hlinčíková", "Kováč", "Vargová", "Mrázik", "Šimková",
  "Novák", "Bartošová", "Hricko", "Pavlovičová", "Tomeček", "Slezáková",
  "Beneš", "Halmová", "Slávik", "Žúdelová", "Holub", "Pavličková", "Drozd",
];
const CITIES = [
  "Bratislava", "Košice", "Žilina", "Nitra", "Banská Bystrica", "Trnava",
  "Prešov", "Trenčín", "Martin", "Poprad", "Pezinok", "Senec", "Piešťany",
];
const PRIESTORY = [
  "Garáž", "Garáž — 2 autá", "Sklad", "Dielňa", "Hala", "Obývačka",
  "Kúpeľňa", "Pivnica", "Terasa", "Spálňa",
];
const TYPY_PODLAH = [
  "Jednofarebná", "Chipsová", "Mramorová", "Metalická",
];
const TERMINY = [
  "Tento mesiac", "Do 3 mesiacov", "Do 6 mesiacov", "Tento rok", "Bez termínu",
];
const CAMPAIGNS = [
  "Cenová ponuka — garáže",
  "Cenová ponuka",
  "Search — epoxidové podlahy cena",
  "Garážové podlahy Bratislava",
  "IG Reels — metalické podlahy",
  "Search — podlaha do garáže",
  "Mramorové podlahy obývačka",
  "Telefonický dopyt",
];
const SOURCES = [
  "web_webhook", "facebook", "instagram", "google", "manual",
];
const STATUSES = [
  "new", "new", "new", "phone_revealed", "phone_revealed",
  "no_answer", "scheduled", "interested", "quote_sent", "won",
];
const PRIORITIES = ["low", "medium", "medium", "high"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone(): string {
  const prefixes = ["905", "907", "911", "915", "919", "940", "944", "948"];
  const prefix = pick(prefixes);
  const rest = Math.floor(100000 + Math.random() * 899999).toString();
  return `+421 ${prefix} ${rest.slice(0, 3)} ${rest.slice(3)}`;
}

function randomEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, ".");
  return `${slug}@example.sk`;
}

export async function GET(request: Request) {
  // Prod: IBA info@epoxidovo.sk (jediný ktorý smie seedovať v proda pre QA).
  // Dev: ktokoľvek.
  if (process.env.NODE_ENV === "production") {
    const me = await getCurrentAppUser();
    if (!me || me.email.toLowerCase() !== "info@epoxidovo.sk") {
      return NextResponse.json(
        { ok: false, error: "Seed v proda iba pre info@epoxidovo.sk" },
        { status: 403 },
      );
    }
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();
  const count = Math.max(1, Math.min(50, parseInt(searchParams.get("count") ?? "10", 10)));

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "missing ?email=<agent-email>" },
      { status: 400 },
    );
  }

  const sb = createAdminClient();

  // 1) Nájsť agent ID podľa emailu
  const { data: agent, error: agentErr } = await sb
    .from("users")
    .select("id, email, name, role")
    .eq("email", email)
    .maybeSingle();

  if (agentErr || !agent) {
    return NextResponse.json(
      { ok: false, error: `agent not found: ${email}` },
      { status: 404 },
    );
  }

  // 2) Vygenerovať N leadov
  const now = Date.now();
  const leadsToInsert = Array.from({ length: count }, (_, i) => {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const sourceType = pick(SOURCES);
    const status = pick(STATUSES);
    const priority = pick(PRIORITIES);
    const priestor = pick(PRIESTORY);
    const typPodlahy = pick(TYPY_PODLAH);
    const lokalita = pick(CITIES);
    const termin = pick(TERMINY);
    const plocha = Math.floor(15 + Math.random() * 100).toString();
    const valueEstimate = Math.floor(800 + Math.random() * 5000);

    // Created_at v posledných 14 dňoch
    const createdAt = new Date(
      now - Math.floor(Math.random() * 14 * 24 * 60 * 60 * 1000),
    ).toISOString();

    // Niektoré majú phone, niektoré email, väčšina oboje
    const hasEmail = Math.random() < 0.7;
    const phone = randomPhone();
    const phoneRevealed = ["phone_revealed", "no_answer", "scheduled", "interested", "quote_sent", "won"].includes(status);

    return {
      source_id: null, // null = manuálne (nevyžaduje webhook source FK)
      source_type: sourceType,
      source_campaign: pick(CAMPAIGNS),
      name,
      phone,
      phone_revealed_at: phoneRevealed ? createdAt : null,
      phone_revealed_by: phoneRevealed ? agent.id : null,
      email: hasEmail ? randomEmail(name) : null,
      data: {
        plocha,
        priestor,
        typ_podlahy: typPodlahy,
        lokalita,
        termin,
        seed_index: i + 1,
      },
      status,
      priority,
      value_estimate: valueEstimate,
      assigned_to: agent.id,
      call_attempts: status === "no_answer" ? Math.floor(1 + Math.random() * 3) : 0,
      next_callback_at: status === "scheduled"
        ? new Date(now + Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString()
        : null,
      first_contact_at: phoneRevealed ? createdAt : null,
      last_activity_at: createdAt,
      created_at: createdAt,
      sla_deadline: new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      sla_status: status === "won" || status === "interested" ? "met" : "pending",
    };
  });

  // 3) Bulk insert
  const { data: inserted, error: insErr } = await sb
    .from("leads")
    .insert(leadsToInsert)
    .select("id, name, status");

  if (insErr) {
    return NextResponse.json(
      { ok: false, error: `insert failed: ${insErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    agent: {
      id: agent.id,
      email: agent.email,
      name: agent.name,
      role: agent.role,
    },
    count: inserted?.length ?? 0,
    leads: inserted,
  });
}
