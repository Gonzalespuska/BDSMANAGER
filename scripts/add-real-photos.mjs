// Vezme existujúcu fotku z leadu ktorý má fotky, stiahne ju, a nahrá do
// 5 empty leadov (aby demo obchodáka nevyzeralo prázdne po odoslaní).
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Nájdi 1 existujúcu fotku
const { data: src } = await sb.from("inspection_media")
  .select("storage_path")
  .not("storage_path", "ilike", "%fake-test-photo%")
  .limit(1)
  .maybeSingle();
if (!src) { console.error("No source photo"); process.exit(1); }
console.log("Source:", src.storage_path);
// Download
const { data: file, error: dErr } = await sb.storage.from("inspection-media").download(src.storage_path);
if (dErr) { console.error(dErr); process.exit(1); }
const buffer = Buffer.from(await file.arrayBuffer());
console.log("Downloaded:", buffer.length, "bytes");

// Nájdi leady bez fotiek (status=inspected)
const { data: inspected } = await sb.from("leads")
  .select("id, name")
  .eq("status", "inspected");
const emptyLeads = [];
for (const l of inspected) {
  const { count } = await sb.from("inspection_media")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", l.id);
  if ((count ?? 0) === 0) emptyLeads.push(l);
}
console.log(`Empty leads: ${emptyLeads.length}`);

// Nahraj kópiu do každého + INSERT do DB
for (const l of emptyLeads) {
  const tags = ["floor_top", "defects", "floor_top"];
  for (let i = 0; i < 2; i++) {
    const path = `${l.id}/demo-${Date.now()}-${i}.jpg`;
    const { error: uErr } = await sb.storage.from("inspection-media")
      .upload(path, buffer, { contentType: "image/jpeg" });
    if (uErr) { console.error(l.name, "upload:", uErr.message); continue; }
    await sb.from("inspection_media").insert({
      lead_id: l.id,
      storage_path: path,
      file_type: "image",
      mime_type: "image/jpeg",
      original_filename: "demo.jpg",
      size_bytes: buffer.length,
      checklist_key: tags[i],
    });
  }
  console.log(`✓ ${l.name} → +2 fotky`);
}
console.log(`\n✅ Hotovo. Refresh /obhliadnute — fotky by mali byť viditeľné.`);
