// scripts/seed-test-obhliadky-days.mjs
// Vytvorí obhliadky na najbližších 7 dní s RÔZNYM počtom per deň —
// aby si videl ako sa správa date-grouping v /obhliadky (Aktívne tab).
//
// Distribúcia:
//   Pon 4, Uto 10, Str 1, Štv 6, Pia 3, Sob 2, Ned 8  → total 34
//
// Použitie: node scripts/seed-test-obhliadky-days.mjs

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = fs
  .readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"))
  .reduce((a, l) => {
    const i = l.indexOf("=");
    if (i > 0) a[l.slice(0, i)] = l.slice(i + 1);
    return a;
  }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: obhl } = await sb
  .from("users")
  .select("id, name")
  .eq("email", "obhliadky@epoxidovo.sk")
  .maybeSingle();
const { data: obch } = await sb
  .from("users")
  .select("id, name")
  .eq("email", "info@epoxidovo.sk")
  .maybeSingle();
if (!obhl) throw new Error("obhliadky@epoxidovo.sk user not found");
if (!obch) throw new Error("info@epoxidovo.sk user not found");

// ── Zmaz staré TEST DAY obhliadky ──
const { data: deleted } = await sb
  .from("leads")
  .delete()
  .ilike("name", "TEST DAY%")
  .select("id");
console.log(`Zmazaných starých TEST DAY leadov: ${deleted?.length ?? 0}\n`);

// ── Distribúcia počtov per deň (od pondelka) ──
const perDay = {
  Pondelok: 4,
  Utorok: 10,
  Streda: 1,
  Štvrtok: 6,
  Piatok: 3,
  Sobota: 2,
  Nedeľa: 8,
};

// Nájdi najbližší pondelok od zajtra (aby to boli budúce obhliadky)
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);
// JS getDay: 0=nedeľa, 1=pondelok ... 6=sobota
let daysToMonday = (1 - tomorrow.getDay() + 7) % 7;
if (daysToMonday === 0 && tomorrow.getDay() !== 1) daysToMonday = 7;
const monday = new Date(tomorrow);
monday.setDate(monday.getDate() + daysToMonday);

const CITIES = [
  "Bratislava",
  "Košice",
  "Prešov",
  "Žilina",
  "Nitra",
  "Banská Bystrica",
  "Trnava",
  "Trenčín",
  "Ružomberok",
  "Poprad",
  "Michalovce",
  "Piešťany",
  "Levice",
  "Považská Bystrica",
];
const PRIESTORY = [
  "Byt (obývačka)",
  "Byt (kúpeľňa + WC)",
  "Garáž (jednogaráž)",
  "Garáž (dvojgaráž)",
  "Priemysel (sklad)",
  "Priemysel (výrobná hala)",
  "Interiér — chodba",
  "Interiér — kuchyňa",
];
const TYPY = ["Chipsová", "Metalická", "Mramorová", "Jednofarebná", "Antistatická"];
const FIRST = [
  "Peter",
  "Anna",
  "Ján",
  "Zuzana",
  "Michal",
  "Katarína",
  "Tomáš",
  "Mária",
  "Marek",
  "Lucia",
  "Martin",
  "Eva",
  "Juraj",
  "Iveta",
  "Roman",
  "Silvia",
  "Igor",
  "Dana",
  "Filip",
  "Kristína",
];
const LAST = [
  "Novák",
  "Kováč",
  "Horváth",
  "Varga",
  "Tóth",
  "Baláž",
  "Šimko",
  "Krajčí",
  "Dobrý",
  "Mikula",
  "Kubík",
  "Hrušovský",
  "Súkeník",
  "Slovák",
  "Šimon",
  "Fiala",
  "Zima",
  "Rehák",
  "Malý",
  "Vysoký",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const dayNames = Object.keys(perDay);
let idx = 0;
let created = 0;

for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
  const dayName = dayNames[dayOffset];
  const count = perDay[dayName];
  const day = new Date(monday);
  day.setDate(day.getDate() + dayOffset);
  const dateLabel = day.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" });
  console.log(`${dayName} (${dateLabel}) — pridávam ${count} obhliadok`);

  for (let i = 0; i < count; i++) {
    idx++;
    // Rozprestri hodiny 8:00-16:00, každá obhliadka o 1 h neskôr
    const hour = 8 + (i % 9);
    const startTs = new Date(day);
    startTs.setHours(hour, i % 2 === 0 ? 0 : 30, 0, 0);

    const name = `TEST DAY · ${pick(FIRST)} ${pick(LAST)}`;
    const lokalita = pick(CITIES);
    const plocha = String(20 + Math.floor(Math.random() * 300));
    const priestor = pick(PRIESTORY);
    const typ = pick(TYPY);
    const phone = `+42190${String(5000000 + idx).slice(0, 7)}`;
    const nowIso = new Date().toISOString();

    const { error } = await sb.from("leads").insert({
      source_id: "22222222-2222-2222-2222-222222222222",
      source_type: "manual",
      source_campaign: "TEST day distribution seed",
      name,
      phone,
      email: null,
      data: {
        full_name: name.replace("TEST DAY · ", ""),
        phone,
        plocha,
        priestor,
        typ_podlahy: typ,
        lokalita,
        termin: "Do 2 mesiacov",
      },
      status: "needs_inspection",
      assigned_to: obch.id,
      inspection_by: obhl.id,
      inspection_at: startTs.toISOString(),
      created_at: nowIso,
      last_activity_at: nowIso,
    });
    if (error) {
      console.error(`  ❌ ${name}:`, error.message);
      continue;
    }
    created++;
  }
}

console.log(`\n✅ Vytvorených ${created} TEST DAY obhliadok na 7 dní od ${monday.toLocaleDateString("sk-SK")}`);
console.log(`   Otvor /obhliadky (obhliadkár) — vidíš date grouping s rôznym počtom.`);
