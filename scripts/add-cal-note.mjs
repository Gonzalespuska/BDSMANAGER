import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Nájdi lead Peter Múdry
const { data: lead } = await sb
  .from("leads")
  .select("id, name, inspection_at, inspection_by, assigned_to, data")
  .eq("name", "Peter Múdry")
  .eq("status", "needs_inspection")
  .maybeSingle();
if (!lead) { console.log("Lead nenájdený"); process.exit(0); }
console.log("Lead:", { id: lead.id.slice(0, 8), name: lead.name, at: lead.inspection_at });

// Skontroluj či už existuje calendar_note pre tento lead
const { data: existing } = await sb
  .from("calendar_notes")
  .select("id")
  .eq("lead_id", lead.id)
  .eq("kind", "meeting");
if (existing?.length) {
  console.log("Calendar_note už existuje:", existing.length);
  process.exit(0);
}

const scheduledDate = lead.inspection_at.slice(0, 10); // YYYY-MM-DD
const note = lead.data?.inspection_note ?? "";

const { error } = await sb.from("calendar_notes").insert({
  date: scheduledDate,
  body: `🔍 Obhliadka — ${lead.name}${note ? ` · ${note}` : ""}`,
  kind: "meeting",
  starts_at: lead.inspection_at,
  user_id: lead.assigned_to,      // creator = obchodák
  target_user_id: lead.inspection_by, // priradený obhliadkár
  lead_id: lead.id,
});
if (error) { console.error("Error:", error); process.exit(1); }
console.log("✅ Calendar_note vytvorený pre", scheduledDate, lead.inspection_at);
