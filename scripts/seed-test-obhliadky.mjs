// scripts/seed-test-obhliadky.mjs
// Vytvorí 5x TEST obhliadku pre obhliadky@epoxidovo.sk aby si na
// produkcii mohol testovať flow: needs_inspection → wizard → Odoslať
// → obchodák dostane notifikáciu a leada v /obhliadnute.
//
// Použitie: node scripts/seed-test-obhliadky.mjs

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

// ── 1) Nájdi obhliadkára + obchodáka ─────────────────────────────
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
console.log("Obhliadkár:", obhl.name, obhl.id);
console.log("Obchodák :", obch.name, obch.id);

// ── 2) Zmaz staré TEST obhliadky ─────────────────────────────────
const { data: deleted } = await sb
  .from("leads")
  .delete()
  .ilike("name", "TEST OBHL%")
  .select("id");
console.log(`Zmazaných starých TEST OBHL leadov: ${deleted?.length ?? 0}`);

// ── 3) Vytvor 5 obhliadok — rôzne mesta, priestory, m² ───────────
const cases = [
  {
    name: "TEST OBHL · Peter Malý",
    phone: "+421905111001",
    lokalita: "Bratislava",
    plocha: "45",
    priestor: "Byt (obývačka)",
    typ: "Metalická",
    poznamka: "Klient chce lesk. Prístup z ulice OK.",
  },
  {
    name: "TEST OBHL · Anna Krátka",
    phone: "+421905111002",
    lokalita: "Košice",
    plocha: "120",
    priestor: "Garáž (dvojgaráž)",
    typ: "Chipsová",
    poznamka: "Do 2 mesiacov. Manžel dodá elektriku.",
  },
  {
    name: "TEST OBHL · Ján Vysoký",
    phone: "+421905111003",
    lokalita: "Ružomberok",
    plocha: "220",
    priestor: "Priemysel (skladová hala)",
    typ: "Jednofarebná",
    poznamka: "Priemyselná zaťaž — chodí vysokozdvižný vozík.",
  },
  {
    name: "TEST OBHL · Zuzana Hnedá",
    phone: "+421905111004",
    lokalita: "Trnava",
    plocha: "35",
    priestor: "Byt (kúpeľňa + WC)",
    typ: "Mramorová",
    poznamka: "Vlhkosť môže byť issue. Skontrolovať dôsledne.",
  },
  {
    name: "TEST OBHL · Michal Vysoký",
    phone: "+421905111005",
    lokalita: "Žilina",
    plocha: "80",
    priestor: "Garáž (jednogaráž)",
    typ: "Metalická",
    poznamka: "Klient chce začať v októbri.",
  },
];

const now = new Date();
const created = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  // Rozvrhni obhliadky na najbližšie 5 dní (od zajtra, o 10:00)
  const day = new Date(now);
  day.setDate(day.getDate() + 1 + i);
  day.setHours(10, 0, 0, 0);

  const ts = now.toISOString();
  const { data: lead, error } = await sb
    .from("leads")
    .insert({
      source_id: "22222222-2222-2222-2222-222222222222", // TEST source
      source_type: "manual",
      source_campaign: "TEST obhliadka seed",
      name: c.name,
      phone: c.phone,
      email: null,
      data: {
        full_name: c.name.replace("TEST OBHL · ", ""),
        phone: c.phone,
        plocha: c.plocha,
        priestor: c.priestor,
        typ_podlahy: c.typ,
        lokalita: c.lokalita,
        termin: "Do 2 mesiacov",
        inspection_note: c.poznamka,
      },
      status: "needs_inspection",
      assigned_to: obch.id,
      inspection_by: obhl.id,
      inspection_at: day.toISOString(),
      created_at: ts,
      last_activity_at: ts,
    })
    .select("id, name")
    .single();
  if (error) {
    console.error("❌", c.name, error.message);
    continue;
  }
  created.push(lead);
  console.log(`✓ ${lead.name} · ${c.lokalita} · ${c.plocha} m² · ${day.toLocaleDateString("sk-SK")}`);
}

console.log(`\n✅ Vytvorených ${created.length} TEST obhliadok.`);
console.log(`   Obhliadkár uvidí v /obhliadky (Aktívne tab).`);
console.log(`   Klik → wizard → Odoslať → objaví sa u obchodáka v /obhliadnute.`);
