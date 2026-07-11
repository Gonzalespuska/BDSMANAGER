import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// TEST WEB · Michal Predávateľ tiež reset
const { data: testWeb } = await sb.from("leads")
  .select("id, name")
  .ilike("name", "TEST WEB%")
  .eq("status", "inspected");
console.log("TEST WEB inspected:", testWeb.length);
for (const l of testWeb) {
  // Zmaz démonové fotky ak nejaké mal
  const { data: demoMedia } = await sb.from("inspection_media")
    .select("id, storage_path")
    .eq("lead_id", l.id)
    .like("storage_path", "%demo-%");
  for (const m of demoMedia ?? []) {
    await sb.storage.from("inspection-media").remove([m.storage_path]);
    await sb.from("inspection_media").delete().eq("id", m.id);
  }
  await sb.from("leads")
    .update({ status: "needs_inspection", inspection_result: null })
    .eq("id", l.id);
  console.log(`  ✓ ${l.name} → needs_inspection`);
}

// Verify final state — obchodakovske /obhliadnute čo uvidí
const { data: final } = await sb.from("leads")
  .select("id, name, status, assigned_to")
  .in("status", ["inspected", "quote_sent"])
  .not("inspection_result", "is", null)
  .order("last_activity_at", { ascending: false });
console.log(`\n─── V obchodákovej /obhliadnute (${final.length} leadov) ───`);
for (const l of final) console.log(`  ${l.status.padEnd(11)} · ${l.name}`);
