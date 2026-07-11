import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const { data } = await sb.from("leads")
  .select("id, name, status, last_activity_at")
  .in("status", ["inspected", "quote_sent"])
  .order("last_activity_at", { ascending: false });
console.log("Zvyšné (real user submissions):");
for (const l of data) console.log(`  ${l.status.padEnd(11)} · ${l.name} · ${l.last_activity_at?.slice(0,16)}`);
