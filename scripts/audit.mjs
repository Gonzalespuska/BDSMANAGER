import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Get users
const { data: users } = await sb.from("users").select("id, name, email, role");
const obhl = users.find(u => u.email === "obhliadky@epoxidovo.sk");
const obch = users.find(u => u.email === "info@epoxidovo.sk");
console.log("Obhliadkár:", obhl.name, obhl.id);
console.log("Obchodák :", obch.name, obch.id);

// All inspected leads
const { data: inspected } = await sb.from("leads")
  .select("id, name, status, assigned_to, inspection_by, last_activity_at")
  .eq("status", "inspected")
  .order("last_activity_at", { ascending: false });
console.log("\n─── Status='inspected' leads (" + inspected.length + ") ───");
for (const l of inspected) {
  const assignedUser = users.find(u => u.id === l.assigned_to);
  const inspectorUser = users.find(u => u.id === l.inspection_by);
  console.log(`  ${l.name}`);
  console.log(`    assigned_to: ${assignedUser?.email ?? '(NULL/deleted)'} ${l.assigned_to === obch.id ? '✓ obchodák' : '❌'}`);
  console.log(`    inspection_by: ${inspectorUser?.email ?? '(NULL)'} ${l.inspection_by === obhl.id ? '✓ obhliadkár' : '❌'}`);
}

// Fake photos
const { data: fake } = await sb.from("inspection_media")
  .select("id, lead_id, storage_path")
  .like("storage_path", "%fake-test-photo%");
console.log(`\n─── Fake photos (${fake?.length ?? 0}) ───`);
for (const p of fake ?? []) console.log(`  ${p.storage_path}`);
