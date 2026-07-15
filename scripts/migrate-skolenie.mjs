import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Presunúť existujúcich skolenie userov na obchod (default)
const { data: skolUsers } = await sb.from("users").select("id, email, name").eq("role", "skolenie");
console.log(`Skolenie users: ${skolUsers?.length ?? 0}`);
for (const u of skolUsers ?? []) {
  await sb.from("users").update({ role: "obchod" }).eq("id", u.id);
  console.log(`  ${u.email} → obchod`);
}
console.log("✅ Migrácia hotová");
