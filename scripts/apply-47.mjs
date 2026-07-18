#!/usr/bin/env node
/**
 * Apply migration 47_multi_floor_types.sql via Supabase Management API.
 */
import fs from "node:fs";

const SQL_PATH = "/Users/puska/bdsmanager/supabase/47_multi_floor_types.sql";
const sql = fs.readFileSync(SQL_PATH, "utf-8");

const env = fs
  .readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n")
  .reduce((acc, line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SECRET_KEY;
const projectRef = env.SUPABASE_PROJECT_REF;
const accessToken = env.SUPABASE_ACCESS_TOKEN;

if (!url || !serviceKey) {
  console.error("Missing env vars");
  process.exit(1);
}

// Try Management API first (needs SUPABASE_ACCESS_TOKEN + PROJECT_REF)
if (projectRef && accessToken) {
  const mgmtRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (mgmtRes.ok) {
    console.log("✓ Migration 47 applied via Management API");
    const j = await mgmtRes.json();
    console.log(JSON.stringify(j, null, 2));
    process.exit(0);
  }
  console.error("Management API failed:", mgmtRes.status, await mgmtRes.text());
}

// Fallback: exec_sql RPC
const rpcRes = await fetch(url + "/rest/v1/rpc/exec_sql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  },
  body: JSON.stringify({ sql }),
});

if (rpcRes.ok) {
  console.log("✓ Migration 47 applied via exec_sql RPC");
  process.exit(0);
}

console.log("\n❌ Automatické spustenie zlyhalo — spusti manuálne:\n");
console.log("1) Otvor Supabase dashboard SQL editor:");
console.log(`   ${url.replace(/\/?$/, "")}/project/_/sql/new`);
console.log("\n2) Skopíruj a spusti:\n");
console.log("─".repeat(60));
console.log(sql);
console.log("─".repeat(60));
