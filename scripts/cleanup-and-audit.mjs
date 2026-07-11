import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

// Zmaz fake test photos
const { data: deleted, error } = await sb
  .from("inspection_media")
  .delete()
  .like("storage_path", "%fake-test-photo%")
  .select("id, storage_path");
if (error) console.error(error);
console.log(`Zmazaných fake fotiek: ${deleted?.length ?? 0}`);

// Skontroluj obhliadkár counts
const obhlId = "0fc2afeb-5bfd-4143-999a-da7ebb4035bd";
const obchId = "b9c6edd0-ace5-4bab-9202-9861f77e03b9";
const { count: obhlAktivne } = await sb.from("leads").select("id",{count:"exact",head:true})
  .eq("status","needs_inspection").eq("inspection_by",obhlId);
const { count: obhlHotove } = await sb.from("leads").select("id",{count:"exact",head:true})
  .eq("status","inspected").eq("inspection_by",obhlId);
const { count: obchInspected } = await sb.from("leads").select("id",{count:"exact",head:true})
  .eq("status","inspected").eq("assigned_to",obchId);
const { count: obchInspectedOrSent } = await sb.from("leads").select("id",{count:"exact",head:true})
  .in("status",["inspected","quote_sent"]).eq("assigned_to",obchId);

console.log(`\nObhliadkár:`);
console.log(`  Aktívne (needs_inspection + inspection_by=obhl): ${obhlAktivne}`);
console.log(`  Hotové  (inspected + inspection_by=obhl):        ${obhlHotove}`);
console.log(`\nObchodák (admin s view_as=obchod, id=Mário):`);
console.log(`  Badge (inspected + assigned_to=obch):            ${obchInspected}`);
console.log(`  /obhliadnute (inspected OR quote_sent):          ${obchInspectedOrSent}`);
console.log(`\nMalí by sedieť: obhlHotove === obchInspected (obidva = ${obhlHotove === obchInspected ? '✓' : '✗'} match)`);
