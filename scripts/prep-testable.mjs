import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Nájdi 1 TEST DAY lead
const { data: leads } = await sb.from("leads")
  .select("id, name")
  .ilike("name", "TEST DAY%")
  .eq("status", "needs_inspection")
  .limit(1);
if (!leads?.length) { console.log("Žiadne TEST DAY leady"); process.exit(1); }
const lead = leads[0];
console.log("Prep lead:", lead.name, lead.id);

// Nahodíme fake photo path do inspection_media
const fakePath = `${lead.id}/fake-test-photo.jpg`;
await sb.from("inspection_media").insert({
  lead_id: lead.id,
  storage_path: fakePath,
  file_type: "image",
  checklist_key: "floor_top",
});
// Naplníme inspection_result draftom
await sb.from("leads").update({
  inspection_result: {
    measured_m2: 45,
    shapes: [{ id:"main", label:"Hlavná", length_m:5, width_m:9 }],
    moisture_pct: 3,
    moisture_pct_2: 3.5,
    adhesion_mpa: 1.8,
    _draft_saved_at: new Date().toISOString(),
  },
}).eq("id", lead.id);
console.log("✓ Lead pripravený na test Odoslať:", lead.id);
console.log("URL: http://localhost:3100/obhliadky/" + lead.id);
