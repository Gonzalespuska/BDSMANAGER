import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Dnes v Bratislave — 10.7.2026 → zajtra 11.7. 15:30 CEST = 13:30 UTC
// Chcem inspection_at = "2026-07-11T13:30:00+02:00" alebo T13:30:00Z (13:30 UTC = 15:30 lokál)
const zajtra = "2026-07-11T13:30:00+02:00";

const { data: lead } = await sb
  .from("leads")
  .select("id")
  .eq("name", "Peter Múdry")
  .eq("status", "needs_inspection")
  .maybeSingle();
if (!lead) { console.log("no lead"); process.exit(0); }

await sb.from("leads").update({ inspection_at: zajtra }).eq("id", lead.id);
await sb.from("calendar_notes").update({
  date: "2026-07-11",
  starts_at: zajtra,
}).eq("lead_id", lead.id).eq("kind", "meeting");
console.log("✅ Termín obhliadky nastavený na 11. 7. 2026 15:30 CEST");
