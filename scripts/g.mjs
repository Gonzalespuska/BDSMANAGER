import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const { data } = await sb.from("leads")
  .select("id, name, data, inspection_result")
  .eq("status", "inspected").limit(3);
for (const l of data) {
  console.log(`${l.name}`);
  console.log(`  data.plocha        = ${l.data?.plocha}`);
  console.log(`  data.lokalita      = ${l.data?.lokalita}`);
  console.log(`  measured_m2 (insp) = ${l.inspection_result?.measured_m2}`);
}
