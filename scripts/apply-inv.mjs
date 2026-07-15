import fs from "node:fs";
import { Client } from "pg";

const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});

// Extract project id from Supabase URL
const projectId = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase/)[1];
console.log("Project:", projectId);
console.log("Note: budeš musieť spustit SQL manuálne v Supabase SQL editore.");
console.log("Súbor: /Users/puska/bdsmanager/supabase/28_inventory.sql");
