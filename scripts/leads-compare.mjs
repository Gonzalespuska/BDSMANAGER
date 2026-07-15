import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Vezmi 2 real (nie TEST) leady — 1 FB + 1 web
const { data: fb } = await sb.from("leads")
  .select("id, name, phone, email, source_id, source_type, source_campaign, data, status, created_at")
  .eq("source_type", "meta_lead_ads")
  .not("name", "ilike", "TEST%")
  .order("created_at", { ascending: false })
  .limit(2);

const { data: web } = await sb.from("leads")
  .select("id, name, phone, email, source_id, source_type, source_campaign, data, status, created_at")
  .eq("source_type", "web_form")
  .not("name", "ilike", "TEST%")
  .order("created_at", { ascending: false })
  .limit(2);

// Ak nemám z prod, pozri všetky source_types
if ((!fb || !fb.length) && (!web || !web.length)) {
  const { data: types } = await sb.from("leads")
    .select("source_type")
    .not("source_type", "is", null);
  console.log("Sourceové typy v DB:", [...new Set(types?.map(t => t.source_type))]);
}

console.log("\n=== FACEBOOK LEADY (meta_lead_ads) ===");
fb?.forEach((l, i) => {
  console.log(`\n--- FB Lead ${i + 1} ---`);
  console.log(JSON.stringify(l, null, 2));
});

console.log("\n\n=== WEB LEADY (web_form) ===");
web?.forEach((l, i) => {
  console.log(`\n--- Web Lead ${i + 1} ---`);
  console.log(JSON.stringify(l, null, 2));
});
