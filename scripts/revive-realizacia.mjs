// Prehodí Peter Múdry (a hocijaké won leady s realization_at v posledných
// 48h) späť na in_realization, aby ich realizator videl ako aktívne.
//
// User 2026-07-11: obchodák dal realizáciu 10.7. 08:00, dnes 11.7. — auto
// transition ju hneď hodil do won. Fix ide sem + do produkčného auto-transition.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Nájdi won leady s realization_at v posledných 48h (recent test-assigns)
const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
const { data: recent, error } = await sb
  .from("leads")
  .select("id, name, status, realization_at, realization_completed_at")
  .eq("status", "won")
  .not("realization_by", "is", null)
  .gte("realization_at", cutoff);
if (error) { console.error(error); process.exit(1); }
console.log(`Found ${recent.length} recent won-tagged realizations:`);
for (const l of recent) {
  console.log(`  - ${l.name} @ ${l.realization_at}`);
}
if (recent.length === 0) process.exit(0);

const ids = recent.map(l => l.id);
const { error: uErr } = await sb
  .from("leads")
  .update({
    status: "in_realization",
    realization_completed_at: null,
    last_activity_at: new Date().toISOString(),
  })
  .in("id", ids);
if (uErr) { console.error(uErr); process.exit(1); }
console.log(`✓ Revived ${ids.length} lead(s) back to in_realization`);
