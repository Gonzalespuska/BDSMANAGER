import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Skontroluj bucket status
const { data: buckets, error } = await sb.storage.listBuckets();
if (error) { console.error(error); process.exit(1); }
const inspBucket = buckets.find(b => b.id === "inspection-media");
console.log("Bucket status:", inspBucket);

// Skús získať signed URL na náhodnom súbore
const { data: media } = await sb
  .from("inspection_media")
  .select("id, storage_path")
  .limit(1)
  .maybeSingle();
if (media) {
  const { data: signed, error: sErr } = await sb.storage
    .from("inspection-media")
    .createSignedUrl(media.storage_path, 600);
  console.log("Signed URL test:", { signed, sErr });
  // Skus fetch
  if (signed?.signedUrl) {
    const resp = await fetch(signed.signedUrl);
    console.log("Fetch status:", resp.status, resp.headers.get("content-type"));
  }
}
