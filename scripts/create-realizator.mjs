// Vytvorí realizacie@epoxidovo.sk user pre testovanie realizator flow.
// Public.users only — auth.users nie je nutné, admin ho vie impersonate
// cez view_as_user_id cookie.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Ak existuje, updateni
const { data: existing } = await sb.from("users")
  .select("id, name, role, active")
  .eq("email", "realizacie@epoxidovo.sk")
  .maybeSingle();

if (existing) {
  console.log("User exists:", existing);
  // Update na správnu rolu + active
  await sb.from("users")
    .update({ role: "realizacie", active: true, name: existing.name || "Realizátor Test" })
    .eq("id", existing.id);
  console.log("✓ Updated to realizacie + active");
} else {
  // Vytvor nový — capacity=5 (default pre role)
  const { data: created, error } = await sb.from("users")
    .insert({
      email: "realizacie@epoxidovo.sk",
      name: "Realizátor Test",
      role: "realizacie",
      active: true,
      capacity: 5,
    })
    .select()
    .single();
  if (error) throw error;
  console.log("✓ Created:", created);
}

const { data: final } = await sb.from("users")
  .select("id, email, name, role, active, phone, capacity")
  .eq("email", "realizacie@epoxidovo.sk")
  .maybeSingle();
console.log("\nProfil:");
console.log(JSON.stringify(final, null, 2));

console.log("\nPre admin impersonation:");
console.log(`  view_as_user_id cookie = "${final.id}"`);
console.log(`  Cez UI (dropdown 'Zobraziť ako') alebo priamo v /admin/tim`);
