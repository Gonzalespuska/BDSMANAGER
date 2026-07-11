// Zmaz aktuálne testové realizácie (Peter Múdry + TEST WEB).
// Reset ich na status='inspected' a odstráni realization_by/realization_at.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data } = await sb.from("leads")
  .select("id, name, status")
  .eq("status", "in_realization");
console.log("Nájdené in_realization leady:", data.length);
for (const l of data) console.log(`  ${l.name}`);

// Reset na 'inspected' aby zas prišli do obchodákovej "Čaká na CP" / Finálna CP
const ids = data.map(l => l.id);
if (ids.length > 0) {
  const { error } = await sb.from("leads")
    .update({
      status: "quote_sent", // spať na Finálna CP (bola už poslaná CP)
      realization_by: null,
      realization_at: null,
      last_activity_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) throw error;
  console.log("\n✓ Reset done — späť na status='quote_sent' (Finálna CP tab)");

  // Zmaz aj calendar_notes s týmito lead_id ktoré boli o realizácii
  const { data: notes, error: nErr } = await sb.from("calendar_notes")
    .delete()
    .in("lead_id", ids)
    .like("body", "%realiz%")
    .select("id, body");
  if (nErr) console.error("calendar_notes cleanup:", nErr);
  else console.log(`✓ Zmazaných ${notes?.length ?? 0} calendar_notes (Realizácia).`);
}
