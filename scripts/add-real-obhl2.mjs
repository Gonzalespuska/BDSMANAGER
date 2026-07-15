import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data: obhl } = await sb.from("users").select("id, name").eq("email", "obhliadky@epoxidovo.sk").maybeSingle();
const { data: obch } = await sb.from("users").select("id, name").eq("email", "info@epoxidovo.sk").maybeSingle();

const zajtra = new Date();
zajtra.setDate(zajtra.getDate() + 1);
zajtra.setHours(15, 30, 0, 0);

const { data: inserted, error } = await sb.from("leads").insert({
  name: "Peter Múdry",
  phone: "+421 905 812 447",
  email: "peter.mudry@gmail.com",
  status: "needs_inspection",
  inspection_by: obhl.id,
  inspection_at: zajtra.toISOString(),
  assigned_to: obch.id,
  source_type: "web",
  data: {
    plocha: "62",
    lokalita: "Ružomberok",
    priestor: "Garáž pre 2 autá",
    typ_podlahy: "Jednofarebná",
    inspection_note: "Prístup zo dvora — prosím zaklopať bránu. Peter je doma po 15:00.",
    agent_note: "Klient zavolal 2× v priebehu týždňa, chce cenu čo najskôr.",
  },
  first_contact_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  last_activity_at: new Date().toISOString(),
}).select().single();

if (error) { console.error(error); process.exit(1); }
console.log("✅ Pridané:");
console.log({
  id: inserted.id.slice(0, 8),
  name: inserted.name,
  phone: inserted.phone,
  inspection_at: new Date(inserted.inspection_at).toLocaleString("sk-SK"),
  m2: inserted.data.plocha,
  lokalita: inserted.data.lokalita,
  note: inserted.data.inspection_note,
});

// Zaznamenaj aj do lead_activities aby prehľad ukázal aktivitu
try {
  await sb.from("lead_activities").insert({
    lead_id: inserted.id,
    actor_id: obch.id,
    kind: "inspection_assigned",
    payload: { obhliadkar: obhl.name, at: zajtra.toISOString() },
  });
  console.log("+ activity zaznamenaná");
} catch (e) {
  console.log("(activity insert skip:", e.message, ")");
}
