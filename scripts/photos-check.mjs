import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: leads } = await sb.from("leads")
  .select("id, name")
  .eq("status", "inspected")
  .order("last_activity_at", { ascending: false });

for (const l of leads) {
  const { data: photos } = await sb.from("inspection_media")
    .select("id, storage_path")
    .eq("lead_id", l.id);
  // Skús každý súbor stiahnuť
  let ok = 0, broken = 0;
  for (const p of photos ?? []) {
    const { data } = sb.storage.from("inspection-media").getPublicUrl(p.storage_path);
    const r = await fetch(data.publicUrl, { method: "HEAD" });
    if (r.status === 200) ok++; else broken++;
  }
  console.log(`${l.name.padEnd(35)} → DB:${photos?.length ?? 0} · live:${ok} · broken:${broken}`);
}
