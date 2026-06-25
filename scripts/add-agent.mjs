#!/usr/bin/env node
/**
 * scripts/add-agent.mjs — pridá nového obchodníka do BDSManagera.
 *
 * Robí 2 veci atomicky:
 *   1. Vytvorí auth.users záznam (email_confirm=true → OTP login funguje
 *      hneď bez verifikácie email confirmation linku).
 *   2. Vytvorí public.users záznam s rolou "user" alebo "admin", aktívnym
 *      stavom a default capacity=5.
 *
 * Po behu môže obchodník ísť na bdsmanagerr.pages.dev/login, zadať svoj email,
 * dostane 6-cifr kód, vloží ho, je dnu.
 *
 * Použitie:
 *   node scripts/add-agent.mjs --email obchodnik@epoxidovo.sk --name "Ján Obchodník"
 *   node scripts/add-agent.mjs --email admin2@epoxidovo.sk --name "Druhý admin" --role admin
 *   node scripts/add-agent.mjs --email peter@... --name "..." --capacity 8
 *
 * Cesta z root projektu:
 *   cd /Users/puska/bdsmanager && node scripts/add-agent.mjs --email ... --name ...
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Parse args ──
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
}

if (!args.email || !args.name) {
  console.error(
    "Použitie: node scripts/add-agent.mjs --email <email> --name <name> [--role admin|user] [--capacity 0-10]",
  );
  process.exit(1);
}

const role = args.role === "admin" ? "admin" : "user";
const capacity = Math.max(
  0,
  Math.min(10, Number.isFinite(Number(args.capacity)) ? Number(args.capacity) : 5),
);

// ── Read env ──
const envPath = path.join(ROOT, ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Chýba .env.local v root projekte.");
  process.exit(1);
}
const env = fs
  .readFileSync(envPath, "utf-8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"))
  .reduce((acc, l) => {
    const i = l.indexOf("=");
    if (i > 0) acc[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    return acc;
  }, {});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET = env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error("Chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SECRET_KEY v .env.local.");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = String(args.email).trim().toLowerCase();
const name = String(args.name).trim();

console.log(`\nPridávam: ${name} <${email}> (role=${role}, capacity=${capacity})`);

// ── 1. Skontroluj či už neexistuje ──
const { data: existing } = await supa
  .from("users")
  .select("id, email, active")
  .ilike("email", email)
  .maybeSingle();

if (existing) {
  console.log("Užívateľ už existuje v public.users:", existing);
  if (!existing.active) {
    console.log("Reaktivujem (active=false → true) ...");
    const { error } = await supa
      .from("users")
      .update({ active: true })
      .eq("id", existing.id);
    if (error) {
      console.error("Reaktivácia zlyhala:", error.message);
      process.exit(1);
    }
    console.log("✓ Reaktivovaný.");
  }
  process.exit(0);
}

// ── 2. Vytvor auth.users (cez admin API) ──
console.log("Vytváram auth.users záznam ...");
const { data: authRes, error: authErr } = await supa.auth.admin.createUser({
  email,
  email_confirm: true, // skip email confirmation → OTP login môže prebehnúť hneď
  user_metadata: { name },
});

if (authErr) {
  // Ak už existuje v auth.users (z predchádzajúceho behu), spárujeme po emaili
  const lower = authErr.message.toLowerCase();
  if (lower.includes("already") || lower.includes("exists")) {
    console.log("auth.users už existuje, hľadám existing auth_id...");
    const { data: list } = await supa.auth.admin.listUsers({ perPage: 200 });
    const found = list?.users.find(
      (u) => u.email?.toLowerCase() === email,
    );
    if (!found) {
      console.error("Nepodarilo sa nájsť existujúci auth user — abort.");
      process.exit(1);
    }
    var authUser = found;
  } else {
    console.error("auth.admin.createUser zlyhalo:", authErr.message);
    process.exit(1);
  }
} else {
  var authUser = authRes.user;
}

console.log("✓ auth.users id:", authUser.id);

// ── 3. Vytvor public.users ──
console.log("Vytváram public.users ...");
const { data: appUser, error: appErr } = await supa
  .from("users")
  .insert({
    auth_id: authUser.id,
    email,
    name,
    role,
    active: true,
    capacity,
  })
  .select()
  .single();

if (appErr) {
  console.error("public.users insert zlyhalo:", appErr.message);
  console.error("Odporúčanie: pozri či SQL migrácia (capacity column) bola spustená.");
  process.exit(1);
}

console.log("✓ public.users:", {
  id: appUser.id,
  email: appUser.email,
  name: appUser.name,
  role: appUser.role,
  capacity: appUser.capacity,
});

console.log("\n🎉 Hotovo. Pošli ${email} link na bdsmanagerr.pages.dev/login a nech sa prihlási OTP kódom.");
