import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const { data } = await sb.from("leads").select("name, data").ilike("name", "TEST WEB%").limit(2);
for (const l of data) {
  console.log(`${l.name}:`);
  console.log(`  data.lokalita = "${l.data?.lokalita}"`);
  console.log(`  data keys: ${Object.keys(l.data || {}).join(", ")}`);
}
