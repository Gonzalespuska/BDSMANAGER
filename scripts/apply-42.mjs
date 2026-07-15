#!/usr/bin/env node
/**
 * Apply migration 42_lead_reassign_requests.sql via Supabase Management API.
 *
 * Ak Management API nefunguje (žiadny access_token), vypíše SQL a povie
 * userovi otvoriť SQL editor.
 */
import fs from "node:fs";
import path from "node:path";

const SQL_PATH = path.resolve(
  "/Users/puska/bdsmanager/supabase/42_lead_reassign_requests.sql",
);
const sql = fs.readFileSync(SQL_PATH, "utf-8");

// Load .env.local
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

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SECRET_KEY v .env.local");
  process.exit(1);
}

// Skús exec_sql RPC (ak existuje):
const res = await fetch(url + "/rest/v1/rpc/exec_sql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  },
  body: JSON.stringify({ sql }),
}).catch((e) => ({ ok: false, error: e }));

if (res.ok) {
  console.log("✓ Migration 42 applied cez exec_sql RPC");
  process.exit(0);
}

console.log("\n❌ exec_sql RPC nefunguje — treba spustiť manuálne:\n");
console.log("1) Otvor Supabase dashboard SQL editor:");
console.log(`   ${url.replace(/\/?$/, "")}/project/_/sql/new`);
console.log("\n2) Skopíruj + vykonaj tento SQL:\n");
console.log("─".repeat(60));
console.log(sql);
console.log("─".repeat(60));
console.log('\n3) Potom v adminovi klikni "Reload PostgREST cache" v /admin.');
