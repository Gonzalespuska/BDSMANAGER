export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/seed-app-settings
 *
 * Doplní chýbajúce app_settings keys (Firma, Doprava, Zľavy) z migrácie 39
 * cez admin klienta. Ekvivalent spustenia INSERT INTO app_settings časti
 * migrácie 39_admin_full_control.sql, s ON CONFLICT DO NOTHING sémantikou.
 *
 * User 2026-07-12: „ma to vsetko fungovat" — bez tohto endpointu by musel
 * user manuálne spustiť SQL v Supabase editore. Toto to spraví za neho.
 *
 * Response: { ok, inserted, skipped, errors, sample }
 */

const SEED_ROWS: Array<{
  key: string;
  value: unknown;
  label: string;
  description: string;
}> = [
  // ─── Firma ───
  {
    key: "company.name",
    value: "EPOXIDOVO s. r. o.",
    label: "Firma — názov",
    description: "Zobrazuje sa v PDF hlavičkách + e-mail podpisoch",
  },
  {
    key: "company.ico",
    value: "56 966 237",
    label: "Firma — IČO",
    description: "IČO v PDF pätke",
  },
  {
    key: "company.dic",
    value: "2122509813",
    label: "Firma — DIČ",
    description: "DIČ v PDF pätke",
  },
  {
    key: "company.web",
    value: "epoxidovo.sk",
    label: "Firma — web",
    description: "Zobrazí sa v PDF a e-mailoch",
  },
  {
    key: "company.address",
    value: "",
    label: "Firma — adresa sídla",
    description: "Adresa v PDF pätke",
  },
  {
    key: "company.slogan_pdf",
    value: "Odborník na živicové podlahy",
    label: "PDF slogan",
    description: "Text pod logom v PDF",
  },
  {
    key: "pdf.footer_note",
    value: "Ďakujeme za dôveru.",
    label: "PDF pätka — text",
    description: "Text úplne dole na PDF",
  },
  {
    key: "email.brand_name",
    value: "EPOXIDOVO",
    label: "E-mail — brand meno",
    description: "Používa sa v subjectoch a signatúre",
  },
  // ─── Doprava ───
  {
    key: "transport.hq_name",
    value: "Ružomberok",
    label: "Doprava — HQ mesto",
    description: "Sídlo Epoxidovo (východisko pre výpočet km)",
  },
  {
    key: "transport.petrol_per_km",
    value: 0.16,
    label: "Doprava — benzín €/km",
    description: "Náklad na palivo za km (10 L/100 km × 1.6 €/L)",
  },
  {
    key: "transport.amortization_per_km",
    value: 0.3,
    label: "Doprava — amortizácia €/km",
    description: "Amortizácia vozidla (depreciácia + servis + pneu + poistka)",
  },
  {
    key: "transport.startup_fee_eur",
    value: 20,
    label: "Doprava — fixná sadzba za výjazd €",
    description: "Fixný náklad za jeden výjazd (nakladka + čas vodiča)",
  },
  {
    key: "transport.avg_speed_kmh",
    value: 70,
    label: "Doprava — priemerná rýchlosť km/h",
    description: "Pre výpočet času cesty",
  },
  {
    key: "transport.reserve_min",
    value: 20,
    label: "Doprava — rezerva min",
    description: "Bezpečnostná rezerva k času cesty",
  },
  {
    key: "transport.m2_per_day",
    value: 35,
    label: "Realizácia — m² / deň",
    description: "Priemerná plocha za deň realizácie",
  },
  // ─── Zľavy ───
  {
    key: "discounts.quantity_tiers",
    value: [
      { min_m2: 300, discount_pct: 5, label: "5% zľava nad 300 m²" },
      { min_m2: 600, discount_pct: 10, label: "10% zľava nad 600 m²" },
      { min_m2: 1000, discount_pct: 15, label: "15% zľava nad 1000 m²" },
    ],
    label: "Množstevné zľavy",
    description: "JSON array of {min_m2, discount_pct, label}",
  },
];

export async function POST() {
  const user = await getCurrentAppUser();
  if (!user)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const admin = createAdminClient();

  // Zisti čo už tam je (aby sme neprepisali user-edited hodnoty).
  const { data: existing } = await admin.from("app_settings").select("key");
  const existingKeys = new Set((existing ?? []).map((r) => r.key as string));

  const toInsert = SEED_ROWS.filter((r) => !existingKeys.has(r.key));

  if (toInsert.length === 0) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skipped: SEED_ROWS.length,
      message: "Všetky seed keys už existujú.",
    });
  }

  const { error } = await admin.from("app_settings").insert(toInsert);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, tried: toInsert.length },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    inserted: toInsert.length,
    skipped: SEED_ROWS.length - toInsert.length,
    inserted_keys: toInsert.map((r) => r.key),
  });
}
