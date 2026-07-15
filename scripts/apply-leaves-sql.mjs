// Spustí SQL priamo cez postgres connection string (ak je set v env).
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});

// Podpora priameho SQL cez Supabase REST — rpc(pg_query) alebo cez
// admin key + SQL API endpoint (nie priamo, ale postgres-meta má rest).
// Skús Supabase Management API:
const url = `${env.NEXT_PUBLIC_SUPABASE_URL.replace("https://", "https://api.")}`;
// Nefunguje bez management token. Fallback: použi psql cez DATABASE_URL ak dostupné.
// V env je len SUPABASE_SECRET_KEY (service role).

// Alternatíva: pouzij pg_client cez fetch na PostgREST rpc endpoint.
// Toto nefunguje pre DDL. Musí sa spustiť buď SQL editor v dashboard alebo psql.
const sql = `
create table if not exists public.user_leaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reason text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists user_leaves_user_status_idx on public.user_leaves(user_id, status);
create index if not exists user_leaves_date_idx on public.user_leaves(from_date, to_date) where status = 'approved';
`;

// Skus cez PostgREST rpc "sql" — obvykle nie je aktivne.
try {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_SECRET_KEY,
      "Authorization": `Bearer ${env.SUPABASE_SECRET_KEY}`,
    },
    body: JSON.stringify({ sql }),
  });
  console.log(r.status, await r.text());
} catch (e) { console.error(e); }
console.log("\nAk RPC failol, kopiruj SQL vyssie do Supabase Dashboard → SQL Editor.");

// Skusme aspoň insert do sourcov aby sme overili DB conn
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const test = await sb.from("user_leaves").select("id").limit(1);
console.log("\nuser_leaves test SELECT:", test.error?.message ?? `OK (${test.data?.length ?? 0} rows)`);
