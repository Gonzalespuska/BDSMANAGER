import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: leads } = await sb
  .from("leads")
  .select("id, name, status, inspection_by, inspection_at, created_at, users:inspection_by(name,email)")
  .in("status", ["needs_inspection", "inspected"])
  .order("created_at", { ascending: false });

console.log(`Všetky obhliadka leady (${leads.length}):`);
console.table(leads.map(l => ({
  name: l.name,
  status: l.status,
  obhliadkar: l.users?.name ?? (l.inspection_by ? l.inspection_by.slice(0, 8) : "—"),
  isTest: /^\s*TEST/i.test(l.name),
})));
