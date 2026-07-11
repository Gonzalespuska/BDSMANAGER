// Zmení bucket 'inspection-media' na public — potom getPublicUrl vracia
// stabilnú URL bez tokenu. Bezpečnostne OK: fotky podlahy nie sú
// osobné údaje, nikto neuhádne 'inspection-media/<uuid>/<timestamp>-*.jpg'.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

const { data, error } = await sb.storage.updateBucket("inspection-media", {
  public: true,
});
if (error) { console.error("❌", error); process.exit(1); }
console.log("✅ Bucket inspection-media je teraz PUBLIC:", data);

// Overenie
const { data: buckets } = await sb.storage.listBuckets();
const b = buckets.find(x => x.id === "inspection-media");
console.log("Aktuálny stav:", { id: b.id, public: b.public });
