import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: u } = await sb.from("users").select("id,name,email").eq("email", "obhliadky@epoxidovo.sk").maybeSingle();
console.log("Obhliadkar:", u);

const { data: leads } = await sb
  .from("leads")
  .select("id, name, status, inspection_by, inspection_at, created_at")
  .eq("status", "needs_inspection")
  .eq("inspection_by", u.id)
  .order("created_at", { ascending: false });
console.log(`\n${leads.length} obhliadky priradené obhliadkárovi:`);
console.table(leads.map(l => ({
  id: l.id.slice(0, 8),
  name: l.name,
  inspection_at: l.inspection_at,
  created: l.created_at?.slice(0, 10),
  isTest: /^\s*TEST/i.test(l.name),
})));
