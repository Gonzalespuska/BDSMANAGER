import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: lead } = await sb.from("leads").select("id, name, data").eq("name", "Peter Múdry").maybeSingle();
if (!lead) process.exit(0);

const m2 = lead.data?.plocha ? ` · ${lead.data.plocha} m²` : "";
const lokalita = lead.data?.lokalita ? ` · ${lead.data.lokalita}` : "";
const priestor = lead.data?.priestor ? ` · ${lead.data.priestor}` : "";

const body = `🔍 Obhliadka — ${lead.name}${m2}${lokalita}${priestor}`;
await sb.from("calendar_notes").update({
  body,
  contact_name: lead.name,
}).eq("lead_id", lead.id).eq("kind", "meeting");
console.log("✅", body);
