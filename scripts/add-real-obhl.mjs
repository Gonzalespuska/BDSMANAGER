import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Obhliadkár
const { data: obhl } = await sb.from("users")
  .select("id, name, email").eq("email", "obhliadky@epoxidovo.sk").maybeSingle();
console.log("Obhliadkár:", obhl);

// Admin/obchodník ktorý ju priradil
const { data: obch } = await sb.from("users")
  .select("id, name, email").eq("email", "info@epoxidovo.sk").maybeSingle();
console.log("Obchodník (info):", obch);

// Dátum obhliadky — zajtra 15:30
const zajtra = new Date();
zajtra.setDate(zajtra.getDate() + 1);
zajtra.setHours(15, 30, 0, 0);

const lead = {
  name: "Peter Múdry",
  phone: "+421 905 812 447",
  email: "peter.mudry@gmail.com",
  status: "needs_inspection",
  inspection_by: obhl.id,
  inspection_at: zajtra.toISOString(),
  assigned_to: obch.id, // pôvodne priradený obchodákovi
  source: "web",
  data: {
    plocha: "62",
    lokalita: "Ružomberok",
    priestor: "Garáž pre 2 autá",
    typ_podlahy: "Jednofarebná",
    inspection_note: "Prístup zo dvora — prosím zaklopať bránu. Peter je doma po 15:00.",
    agent_note: "Klient zavolal 2× v priebehu týždňa, chce cenu čo najskôr.",
  },
  created_at: new Date().toISOString(),
};

const { data: inserted, error } = await sb.from("leads").insert(lead).select().single();
if (error) { console.error(error); process.exit(1); }
console.log("\n✅ Pridaný lead pre obhliadkára:");
console.log({
  id: inserted.id.slice(0, 8),
  name: inserted.name,
  status: inserted.status,
  inspection_at: inserted.inspection_at,
  obhliadkar_id: inserted.inspection_by,
  m2: inserted.data.plocha,
  lokalita: inserted.data.lokalita,
});
