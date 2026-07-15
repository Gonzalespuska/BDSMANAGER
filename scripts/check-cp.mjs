import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const { data } = await sb.from("leads")
  .select("id, name, status, last_activity_at, data")
  .in("status", ["inspected","quote_sent","interested"])
  .not("inspection_result", "is", null)
  .order("last_activity_at", { ascending: false });
console.log("Obhliadnuté v DB teraz:");
for (const l of data) {
  const q = l.data?.last_quote ? "✓ má last_quote" : "";
  console.log(`  ${l.status.padEnd(11)} · ${l.name} · ${q}`);
}
// Skus vytiahnut activity log pre CP-related eventy
console.log("\nPosledne CP activity:");
const { data: acts } = await sb.from("lead_activities")
  .select("lead_id, type, created_at, data")
  .in("type", ["quote_sent","quote_prepared","quote_logged","status_changed"])
  .order("created_at", { ascending: false })
  .limit(10);
for (const a of acts ?? []) console.log(`  ${a.created_at?.slice(0,16)} · ${a.type} · lead=${a.lead_id.slice(0,8)}`);
