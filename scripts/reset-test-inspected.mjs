// Prehodí VŠETKY TEST leady s status='inspected' (moje auto-submity)
// späť na 'needs_inspection', vyprázdni inspection_result a odstráni
// démonové fotky ktoré som pridal cez add-real-photos.mjs.
// User chce testovať reálny flow od začiatku.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// 1) Najdi TEST leady v status inspected/quote_sent
const { data: pollution } = await sb
  .from("leads")
  .select("id, name, status")
  .or("name.ilike.TEST DAY%,name.ilike.TEST OBHL%")
  .in("status", ["inspected", "quote_sent"]);

console.log("Poškodené (auto-submity) leady:", pollution.length);

// 2) Zmaz démonové fotky (upload z add-real-photos.mjs → storage_path obsahuje "demo-")
if (pollution.length > 0) {
  const ids = pollution.map(l => l.id);
  const { data: demoMedia } = await sb.from("inspection_media")
    .select("id, storage_path, lead_id")
    .in("lead_id", ids)
    .like("storage_path", "%demo-%");
  console.log("Démonové fotky na zmazanie:", demoMedia?.length ?? 0);
  for (const m of demoMedia ?? []) {
    await sb.storage.from("inspection-media").remove([m.storage_path]);
    await sb.from("inspection_media").delete().eq("id", m.id);
  }

  // 3) Reset status + inspection_result
  const { error } = await sb.from("leads")
    .update({ status: "needs_inspection", inspection_result: null })
    .in("id", ids);
  if (error) console.error(error);
  else console.log(`✓ Reset ${ids.length} leadov na needs_inspection`);
}

// Overenie
const { count: inspected } = await sb.from("leads")
  .select("id", { count: "exact", head: true })
  .eq("status", "inspected");
const { count: needsIns } = await sb.from("leads")
  .select("id", { count: "exact", head: true })
  .eq("status", "needs_inspection")
  .or("name.ilike.TEST%");
console.log(`\nStav teraz:\n  status='inspected' v DB: ${inspected}\n  TEST needs_inspection: ${needsIns}`);
