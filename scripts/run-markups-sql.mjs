import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Update margin.material
{
  const { error } = await sb.from("app_settings").update({
    value: 0.37,
    label: "Marža materiál (globálna, %)",
    description: "Marža na predaj materiálu (0.37 = 37 %). Ak sú nastavené per-role marže (markup.primer/main/topcoat/…), tie majú prednosť."
  }).eq("key", "margin.material");
  console.log("margin.material update:", error?.message ?? "OK");
}

// Insert 5 new per-role markups
const rows = [
  { key: "markup.primer",    value: 0.37, label: "Marža — penetrácie",       description: "Marža na predaj Sikafloor primerov (Sikafloor-01/03/150/151/156/161, Topstone EP02)" },
  { key: "markup.main",      value: 0.37, label: "Marža — hlavné nátery",    description: "Marža na hlavné farebné nátery (Sikafloor-264 Plus, 3000, 3000FX, Topstone EP11)" },
  { key: "markup.topcoat",   value: 0.37, label: "Marža — vrchné laky",      description: "Marža na vrchné laky (Sikafloor-3310, 304W, 305W, Topstone EP22 Plus)" },
  { key: "markup.additive",  value: 0.37, label: "Marža — doplnky",          description: "Marža na doplnky (chipsy, piesok, čistič, Level-30, Topstone Akcelerátor)" },
  { key: "markup.transport", value: 0.37, label: "Marža — doprava/paletné",  description: "Marža na paletné + dopravu (EUR paleta, doprava)" },
];
for (const r of rows) {
  const { error } = await sb.from("app_settings").upsert(r, { onConflict: "key" });
  console.log(`${r.key}:`, error?.message ?? "OK");
}

// List result
const { data } = await sb.from("app_settings").select("key, value, label").order("key");
console.log("\nCurrent app_settings:");
console.table(data);
