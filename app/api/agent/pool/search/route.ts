export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agent/pool/search?q=<query>
 *
 * Vyhľadá NEDOTKNUTÉ (phone_revealed_at IS NULL) leady VŠETKÝCH
 * obchodákov ktoré matchujú `q` naprieč:
 *   • name (case-insensitive substring)
 *   • email (case-insensitive substring)
 *   • phone_digits (iba číslice, tolerantné na format)
 *   • data.plocha (m² — ak je q číslo)
 *   • data.lokalita (mesto substring)
 *
 * Používa PoolSearchDrawer → obchodák hľadá lead podľa mena/mesta/m²
 * a keď ho nájde v „nedotknutom poole" niekoho iného, môže klikom
 * „Vziať si" atomicky prevziať vlastníctvo (POST /api/lead/steal).
 *
 * User 2026-07-15: „ak potrebuje manualne podla mena si pridelit lead
 * a vie to meno tak chyti a vyhlada si to, alebo podla m2 ze tam iba
 * napise 12 a vybehne mu vsetko kde je 12 aj email peter12@gmail.com
 * aj 12m2".
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", items: [] },
      { status: 401 },
    );
  }
  // Iba obchodáci a admini môžu pool prezerať (obhliadkári/realizátori nie).
  if (user.role !== "obchod" && user.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "role_denied", items: [] },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const admin = createAdminClient();

  // Number-only substring pre phone match. Ak input začína "0",
  // konvertuj na "421" (SK format) — rovnaká normalizácia ako v /agent search.
  const digits = q.replace(/[^0-9]/g, "");
  const phoneSearch = digits.startsWith("0")
    ? "421" + digits.slice(1)
    : digits;

  // Diakritika-insensitive search cez generated columns name_norm/email_norm.
  // User 2026-07-16: „nevyhladava to furt ako ma som admin chcem pozriet
  // lead". ILIKE '%lukacko%' nenájde 'Lukačko' — Postgres nie je unaccent-friendly.
  // Fix: name_norm = lower(unaccent(name)) generated column (migrácia).
  const escaped = q.replace(/[,%]/g, " ").trim();
  const escapedNorm = escaped
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip client-side diacritics
  const orParts = [
    `name_norm.ilike.%${escapedNorm}%`,
    `email_norm.ilike.%${escapedNorm}%`,
    // JSONB path: data->>lokalita (postgREST syntax) — bez diakritika-fix
    // (lokalita tag typicky bez diakritika: "Presov" nie "Prešov")
    `data->>lokalita.ilike.%${escaped}%`,
  ];
  // Ak q obsahuje čísla (napr. "12" alebo "50"), pridaj match aj na
  // data->>plocha (m²). PostgREST ilike na text-cast JSONB → substring.
  if (digits.length > 0) {
    orParts.push(`data->>plocha.ilike.%${digits}%`);
  }
  // Telefón — samostatný OR (nechceme aby "12" matchlo cez phone).
  // Iba ak search obsahuje ≥ 3 číslice (menej = false positives).
  if (phoneSearch.length >= 3) {
    orParts.push(`phone_digits.ilike.%${phoneSearch}%`);
  }

  // ADMIN — nezáleží na state, admin musí vidieť všetky leady.
  // User 2026-07-16: „nevyhladava to furt ako ma som admin chcem
  // pozriet lead". Predtým sme filtrovali .is(phone_revealed_at, null)
  // + status NOT IN (won,lost,archived) → Miško Lukačko (interested,
  // odhalené číslo) sa nenašiel.
  const isAdmin = user.role === "admin";
  let query = admin
    .from("leads")
    .select(
      "id, name, phone, email, status, source_type, assigned_to, phone_revealed_at, created_at, data",
    );
  if (!isAdmin) {
    query = query
      .is("phone_revealed_at", null)
      .not("status", "in", "(won,lost,archived)");
  }
  const { data: rows, error } = await query
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(isAdmin ? 60 : 30);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, items: [] },
      { status: 500 },
    );
  }

  const items = rows ?? [];
  // Fetch names pre assigned_to (aby obchodák videl komu to teraz patrí).
  const ownerIds = Array.from(
    new Set(
      items
        .map((l) => l.assigned_to as string | null)
        .filter((x): x is string => !!x && x !== user.id),
    ),
  );
  const ownerMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: owners } = await admin
      .from("users")
      .select("id, name, email")
      .in("id", ownerIds);
    for (const u of owners ?? []) {
      ownerMap.set(
        u.id as string,
        ((u.name as string) || (u.email as string)) ?? "",
      );
    }
  }

  // Fetch existujúce PENDING transfer requesty pre tieto leady — v UI
  // ukážeme žltý „PENDING TRANSFER" badge namiesto stealovacieho buttonu
  // (aby dvaja obchodáci nechodili do konfliktu keď už jednanie beží).
  const pendingLeadIds = new Set<string>();
  const pendingByLead = new Map<
    string,
    { kind: "push" | "pull"; requester_id: string; target_id: string }
  >();
  if (items.length > 0) {
    const leadIds = items.map((i) => i.id as string);
    const { data: pending } = await admin
      .from("lead_reassign_requests")
      .select("lead_id, kind, requested_by, to_user_id")
      .in("lead_id", leadIds)
      .eq("status", "pending");
    for (const p of pending ?? []) {
      pendingLeadIds.add(p.lead_id as string);
      pendingByLead.set(p.lead_id as string, {
        kind: (p.kind as "push" | "pull" | undefined) ?? "push",
        requester_id: p.requested_by as string,
        target_id: p.to_user_id as string,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    items: items.map((l) => {
      const data = (l.data as Record<string, unknown> | null) ?? {};
      const pending = pendingByLead.get(l.id as string) ?? null;
      return {
        id: l.id as string,
        name: (l.name as string) ?? "",
        email: (l.email as string | null) ?? null,
        // NIKDY nevraciame telefón — obchodák si musí najprv "vziať" lead,
        // až potom môže odhaliť číslo. Toto chráni untouched pool proti
        // ex-filtration cez fuzzy search.
        status: l.status as string,
        source_type: l.source_type as string,
        assigned_to: (l.assigned_to as string | null) ?? null,
        assigned_to_name:
          l.assigned_to === user.id
            ? "TY"
            : (l.assigned_to
                ? (ownerMap.get(l.assigned_to as string) ?? "iný obchodník")
                : "NEPRIDELENÝ"),
        is_mine: l.assigned_to === user.id,
        created_at: l.created_at as string,
        lokalita: (data.lokalita as string | undefined) ?? null,
        plocha: (data.plocha as string | undefined) ?? null,
        message: (data.message as string | undefined) ?? null,
        pending_transfer: pending
          ? {
              kind: pending.kind,
              // Ja som iniciátor → mám čakať odpoveď
              i_initiated: pending.requester_id === user.id,
              // Ja som cieľ (musím odpovedať)
              i_must_respond:
                pending.kind === "push"
                  ? pending.target_id === user.id
                  : (l.assigned_to as string | null) === user.id,
            }
          : null,
      };
    }),
  });
}
