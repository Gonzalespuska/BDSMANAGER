import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// ── 1. Zmaz všetky TEST leady (žiadny bordel) ──
const { data: deleted } = await sb
  .from("leads")
  .delete()
  .ilike("name", "TEST%")
  .select("id, name");
console.log(`Zmazané TEST leady: ${deleted?.length ?? 0}`);

// ── 2. Nájdi info@ (Mário) — bude assigned_to ──
const { data: mario } = await sb
  .from("users").select("id").eq("email", "info@epoxidovo.sk").maybeSingle();

// ── 3. Vytvor 1 FB TEST lead ──
const fbTs = new Date().toISOString();
const { data: fbLead } = await sb.from("leads").insert({
  source_id: "22222222-2222-2222-2222-222222222222",
  source_type: "facebook",
  source_campaign: "Lead - SK - Broad",
  name: "TEST FB · Katarína Nová",
  phone: "+421905998877",
  email: null, // FB obvykle nezbiera
  data: {
    full_name: "Katarína Nová",
    phone: "+421905998877",
    plocha: "80",
    priestor: "garáž",
    "👉_typ_priestoru": "🏠_garáž",
    "👉_približná_rozloha_(m²)": "📊_60_–_100_m²",
    meta_ad_id: "120247895995230511",
    meta_ad_name: "all videos",
    meta_form_id: "2158889608179124",
    meta_adset_id: "120247895995220511",
    meta_adset_name: "Tristas videa",
    meta_platform: "fb",
    meta_campaign_id: "120247895995240511",
    meta_campaign_name: "Lead - SK - Broad",
    meta_leadgen_id: "TEST_FB_" + Date.now(),
    meta_created_time: Math.floor(Date.now() / 1000),
  },
  status: "new",
  assigned_to: mario.id,
  created_at: fbTs,
  last_activity_at: fbTs,
  sla_deadline: new Date(Date.now() + 10 * 3600_000).toISOString(),
  sla_status: "pending",
}).select().single();
console.log("✅ FB TEST:", fbLead.name);

// ── 4. Vytvor 1 Web TEST lead ──
const webTs = new Date().toISOString();
const { data: webLead } = await sb.from("leads").insert({
  source_type: "web_webhook",
  source_campaign: "Cenová ponuka (epoxidovo.sk)",
  name: "TEST WEB · Michal Predávateľ",
  phone: "0908 123 456",
  email: "michal.pt@gmail.com",
  data: {
    epx_id: "TEST_EPX_" + Date.now(),
    plocha: "48",
    priestor: "Byt / dom (interiér)",
    lokalita: "Trnava",
    typ_podlahy: "Chipsová",
    message: "Plocha: 48 m²\nMesto: Trnava\nTermín: Do 2 mesiacov\nTyp priestoru: Byt (obývačka + chodba)\n\nDoplňujúce info:\nChcem chipsovú bledú, ako v katalógu.",
    referrer: "https://epoxidovo.sk/cenova-ponuka",
    _epx_source: "cenova_ponuka_form",
  },
  status: "new",
  assigned_to: mario.id,
  created_at: webTs,
  first_contact_at: webTs,
  last_activity_at: webTs,
  sla_deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
  sla_status: "pending",
}).select().single();
console.log("✅ Web TEST:", webLead.name);

console.log("\n✅ Hotovo. V /agent v tabe 'Nové' uvidíš oba leady vedľa seba.");
console.log("   → Klik na jeden → Poslať na obhliadku → priradiť Obhliadkar Test na dnes/zajtra.");
console.log("   → Prihlás sa ako obhliadky@ → uvidíš iba tú jednu ktorú si mu explicitne priradil.");
