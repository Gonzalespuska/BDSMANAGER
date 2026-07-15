// Vytvorí tabuľku user_leaves + auto-schválenie by admin.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync("/Users/puska/bdsmanager/.env.local","utf-8")
  .split("\n").filter(l=>l&&!l.startsWith("#"))
  .reduce((a,l)=>{const i=l.indexOf("=");if(i>0)a[l.slice(0,i)]=l.slice(i+1);return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

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

// Supabase JS nemá raw SQL — použijeme rpc alebo priamo. Nemáme rpc, tak
// najprv skús pomocou Supabase Studio SQL API cez postgres-meta. Nie je
// dostupné. Musíme SQL spustiť manuálne v Supabase Dashboard.
console.log("Spusti tento SQL v Supabase SQL Editor:");
console.log(sql);
