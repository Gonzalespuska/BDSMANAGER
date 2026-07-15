import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: obhl } = await sb.from("users").select("id").eq("email", "obhliadky@epoxidovo.sk").maybeSingle();
const { data: testLeads } = await sb
  .from("leads")
  .select("id, name")
  .eq("inspection_by", obhl.id)
  .eq("status", "needs_inspection")
  .ilike("name", "TEST%");

console.log(`Mažem ${testLeads.length} TEST obhliadok...`);
for (const l of testLeads) {
  const { error } = await sb.from("leads").delete().eq("id", l.id);
  console.log(`  ${l.name}: ${error?.message ?? "OK"}`);
}
