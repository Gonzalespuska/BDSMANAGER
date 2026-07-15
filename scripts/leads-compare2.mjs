import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: fb } = await sb.from("leads")
  .select("*")
  .eq("source_type", "facebook")
  .not("name", "ilike", "TEST%")
  .order("created_at", { ascending: false })
  .limit(2);

const { data: web } = await sb.from("leads")
  .select("*")
  .in("source_type", ["web", "web_webhook"])
  .not("name", "ilike", "TEST%")
  .order("created_at", { ascending: false })
  .limit(2);

console.log("=== FACEBOOK LEADY ===");
fb?.forEach((l, i) => {
  console.log(`\n--- FB Lead ${i + 1}: ${l.name} ---`);
  console.log(JSON.stringify(l, null, 2));
});

console.log("\n\n=== WEB LEADY ===");
web?.forEach((l, i) => {
  console.log(`\n--- Web Lead ${i + 1}: ${l.name} ---`);
  console.log(JSON.stringify(l, null, 2));
});
