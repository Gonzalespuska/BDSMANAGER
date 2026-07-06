export const runtime = "edge";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertDevOnly } from "@/lib/dev-guard";

/**
 * GET /api/dev/seed-obhliadky
 *
 * Vygeneruje 15 test leadov so status='needs_inspection' — priradí ich
 * prvému obhliadkárovi z DB (rola='obhliadky'). Termíny obhliadok
 * distribuované v najbližších 14 dňoch.
 *
 * Použitie:
 *   curl http://localhost:3100/api/dev/seed-obhliadky
 *
 * DEV-only (assertDevOnly gate).
 */

const FIRST_NAMES = [
  "Barbora", "Martin", "Daniela", "Peter", "Lucia", "Jozef", "Andrea",
  "Marek", "Zuzana", "Tomáš", "Katarína", "Michal", "Lenka", "Juraj", "Monika",
];
const LAST_NAMES = [
  "Dornič", "Krajčovič", "Hlinčíková", "Kováč", "Vargová", "Mrázik",
  "Šimková", "Novák", "Bartošová", "Hricko", "Pavlovičová", "Tomeček",
  "Slezáková", "Beneš", "Halmová",
];
const CITIES = [
  "Bratislava", "Košice", "Žilina", "Nitra", "Trnava", "Prešov",
  "Trenčín", "Martin", "Poprad", "Senec", "Piešťany",
];
const PRIESTORY = [
  "Garáž", "Garáž — 2 autá", "Sklad", "Dielňa", "Hala", "Terasa", "Pivnica",
];
const TYPY = ["Jednofarebná", "Chipsová", "Mramorová", "Metalická"];

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}

function randomPhone(): string {
  return `+4219${Math.floor(10000000 + Math.random() * 89999999)}`;
}

export async function GET(request: Request) {
  const blocked = assertDevOnly(request);
  if (blocked) return blocked;

  const sb = createAdminClient();

  // Nájdi prvého obhliadkára
  const { data: inspector } = await sb
    .from("users")
    .select("id, email, name")
    .eq("role", "obhliadky")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!inspector) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_obhliadkar_found",
        hint: "Vytvor obhliadkára cez /api/dev/set-user?role=obhliadky&email=...",
      },
      { status: 404 },
    );
  }

  // Nájdi prvého obchodáka (assigned_to)
  const { data: agent } = await sb
    .from("users")
    .select("id")
    .eq("role", "obchod")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const leads = Array.from({ length: 15 }, (_, i) => {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const plocha = String(Math.floor(20 + Math.random() * 120));
    // Rozdel v ďalších 14 dňoch (1..14)
    const inspectionAt = new Date(now + (1 + (i % 14)) * dayMs);
    inspectionAt.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);
    return {
      source_id: null,
      source_type: "manual",
      name,
      phone: randomPhone(),
      email: null,
      data: {
        plocha,
        priestor: pick(PRIESTORY),
        typ_podlahy: pick(TYPY),
        lokalita: pick(CITIES),
        note_from_obchod: `Zavolal — chce ${pick(TYPY).toLowerCase()} podlahu, ${plocha} m². Obhliadka dohodnutá.`,
        seed_index: i + 1,
      },
      status: "needs_inspection",
      priority: "normal",
      assigned_to: agent?.id ?? null,
      inspection_by: inspector.id,
      inspection_at: inspectionAt.toISOString(),
      first_contact_at: new Date(now - dayMs).toISOString(),
      last_activity_at: new Date(now - dayMs).toISOString(),
      created_at: new Date(now - dayMs * 2).toISOString(),
    };
  });

  const { data: inserted, error } = await sb
    .from("leads")
    .insert(leads)
    .select("id, name, inspection_at");

  if (error) {
    return NextResponse.json(
      { ok: false, error: `insert failed: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    inspector: { id: inspector.id, email: inspector.email, name: inspector.name },
    count: inserted?.length ?? 0,
    leads: inserted,
  });
}
