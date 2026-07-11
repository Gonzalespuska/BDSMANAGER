import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const { data: leads } = await sb.from("leads").select("id, inspection_result").eq("status","inspected").limit(3);
for (const l of leads) {
  const r = { ...l.inspection_result, agent_note: "Prístup zo dvora OK. Klient chce začať v septembri po dovolenke. Pri hlavnej stene je vlhkosť vyššia — treba parobrzdu (Sikafloor 156). Manžel bude na mieste keď prídeme, vie kde je elektrika." };
  await sb.from("leads").update({ inspection_result: r }).eq("id", l.id);
}
console.log("Poznámky updatované na", leads.length, "leadov");
