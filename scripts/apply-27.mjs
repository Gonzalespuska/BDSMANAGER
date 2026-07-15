import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local", "utf-8")
  .split("\n").filter(l => l && !l.startsWith("#"))
  .reduce((a, l) => { const i = l.indexOf("="); if (i > 0) a[l.slice(0, i)] = l.slice(i + 1); return a; }, {});

// Aplikujem migráciu cez Postgres RPC (supabase-js nemá raw SQL exec)
// Workaround: postgres.js direct connection
const sql = fs.readFileSync("/Users/puska/bdsmanager/supabase/27_dm_rooms.sql", "utf-8");

// Použijem fetch cez SUPABASE_URL/rest/v1/rpc alebo pg_meta
const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const key = env.SUPABASE_SECRET_KEY;

const res = await fetch(url + "/rest/v1/rpc/exec_sql", {
  method: "POST",
  headers: {
    "apikey": key,
    "Authorization": "Bearer " + key,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ sql }),
});
if (!res.ok) {
  console.log("exec_sql RPC neexistuje, treba manuálne v SQL editore.");
  console.log("SQL:", "/Users/puska/bdsmanager/supabase/27_dm_rooms.sql");
  process.exit(0);
}
console.log(await res.text());
