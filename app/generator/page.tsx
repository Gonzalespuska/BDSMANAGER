import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FloorType } from "@/lib/data/materials";

import {
  GeneratorClient,
  type LeadContext,
  type SavedQuoteState,
} from "./generator-client";

// runtime = "edge" disabled — admin client fetch fails in dev edge runtime

export const metadata: Metadata = {
  title: "Generátor ponúk · BDSManager",
};

interface PageProps {
  searchParams: Promise<{ lead?: string; demo?: string; resend?: string }>;
}

/**
 * Mock leady — funguje bez Supabase DB.
 * Použitie: /generator?demo=barbora|martin|daniela|lucia
 */
const DEMO_LEADS: Record<string, LeadContext> = {
  barbora: {
    id: "demo-barbora",
    name: "Barbora Dornič",
    email: "barbora.dornic@example.sk",
    phone: "+421 911 556 006",
    m2: "35",
    floor_type: "chipsova",
    lokalita: "Bratislava",
    priestor: "Garáž, 2 autá",
  },
  martin: {
    id: "demo-martin",
    name: "Martin Krajčovič",
    email: "martin.k@example.sk",
    phone: "+421 905 234 567",
    m2: "85",
    floor_type: "jednofarebna",
    lokalita: "Žilina",
    priestor: "Sklad",
  },
  daniela: {
    id: "demo-daniela",
    name: "Daniela Hlinčíková",
    email: "daniela@example.sk",
    phone: "+421 948 143 981",
    m2: "42",
    floor_type: "metalicka",
    lokalita: "Bratislava",
    priestor: "Garáž",
  },
  lucia: {
    id: "demo-lucia",
    name: "Lucia Vargová",
    email: "lucia.vargova@example.sk",
    phone: "+421 911 778 442",
    m2: "18",
    floor_type: "mramorova",
    lokalita: "Nitra",
    priestor: "Kúpeľňa",
  },
};

function mapFloorType(raw: unknown): FloorType | null {
  if (typeof raw !== "string") return null;
  const norm = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  if (norm.includes("metalick")) return "metalicka";
  if (norm.includes("mramorov")) return "mramorova";
  if (norm.includes("chipsov") || norm.includes("chips")) return "chipsova";
  if (norm.includes("jednofarebn") || norm.includes("solid")) return "jednofarebna";
  return null;
}

export default async function GeneratorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  let leadContext: LeadContext | null = null;

  // Aktuálny obchodák — pre podpis ponuky (PDF footer + email)
  const { getCurrentAppUser } = await import("@/lib/auth");
  const me = await getCurrentAppUser();

  // Načítaj phone z DB (nie je v AppUser type)
  let agentPhone: string | null = null;
  if (me?.id) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const sb = createAdminClient();
      const { data } = await sb
        .from("users")
        .select("phone")
        .eq("id", me.id)
        .maybeSingle();
      agentPhone = (data?.phone as string | null) ?? null;
    } catch (e) {
      console.warn("[generator] phone fetch failed:", e);
    }
  }

  const agentInfo = {
    name: me?.name ?? "Obchodák Epoxidovo",
    email: me?.email ?? "info@epoxidovo.sk",
    phone: agentPhone,
  };

  // ─── Load per-role material markups z /admin/settings ──────────────
  // Ak DB má key `markup.primer`/`markup.main`/`markup.topcoat`/... , generator
  // ich použije na výpočet predaja materiálu podľa role produktu. Fallback:
  // MARZA_MATERIAL_PER_ROLE z pricing.ts (0.37 pre všetko).
  let materialMarkups: Record<string, number> = {};
  // Ceny materiálov ktoré admin prepísal cez /admin/nastavenia → Cenník.
  // 2 kľúčové formáty:
  //   1. material.<id>.price_per_sqm          — default override (všetky systémy)
  //   2. material.<id>.sys.<code>.price_per_sqm — system-specific override
  // Klient vyberie sys-specific ak existuje pre zvolený systém, inak default.
  const priceOverrides: Record<string, number> = {};
  const systemPriceOverrides: Record<string, Record<string, number>> = {};
  try {
    const sb = createAdminClient();
    const { data: settings } = await sb
      .from("app_settings")
      .select("key, value")
      .or("key.like.markup.%,key.eq.margin.material,key.like.material.%");
    for (const s of settings ?? []) {
      const key = s.key as string;
      const raw = s.value;
      const num = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!isFinite(num) || num < 0) continue;
      if (key.startsWith("material.")) {
        // system-specific?
        const sysMatch = key.match(
          /^material\.(.+)\.sys\.([^.]+)\.price_per_sqm$/,
        );
        if (sysMatch) {
          const [, matId, sysCode] = sysMatch;
          (systemPriceOverrides[sysCode] ??= {})[matId] = num;
          continue;
        }
        // default price override
        if (key.endsWith(".price_per_sqm")) {
          const id = key.slice("material.".length, -".price_per_sqm".length);
          if (!id.includes(".sys.")) priceOverrides[id] = num;
        }
      } else if (num < 1) {
        materialMarkups[key] = num;
      }
    }
  } catch (e) {
    console.warn("[generator] settings fetch failed:", e);
  }

  // ─── Load systems (jednofarebna/chipsova/mramorova/metalicka) ─────────
  type SystemRow = {
    code: string;
    label: string;
    floor_type: string;
    binder: string | null;
  };
  let systems: SystemRow[] = [];
  try {
    const sb = createAdminClient();
    const { data } = await sb
      .from("realization_systems")
      .select("code, label, floor_type, binder")
      .eq("active", true)
      .order("floor_type")
      .order("code");
    systems = (data ?? []) as SystemRow[];
  } catch (e) {
    console.warn("[generator] systems fetch failed:", e);
  }

  // ─── Demo mock leads (no DB needed) ──────────────────────────────────
  if (params.demo && DEMO_LEADS[params.demo]) {
    leadContext = DEMO_LEADS[params.demo];
    return (
      <GeneratorClient
        leadContext={leadContext}
        agentInfo={agentInfo}
        materialMarkups={materialMarkups}
        priceOverrides={priceOverrides}
        systemPriceOverrides={systemPriceOverrides}
        systems={systems}
      />
    );
  }

  // ─── Real lead from DB ───────────────────────────────────────────────
  let savedQuote: SavedQuoteState | null = null;
  if (params.lead) {
    try {
      const supabase = createAdminClient();
      const { data: lead } = await supabase
        .from("leads")
        .select("id, name, email, phone, data, inspection_result")
        .eq("id", params.lead)
        .maybeSingle();

      if (lead) {
        const data = (lead.data ?? {}) as Record<string, unknown>;
        const insp = (lead.inspection_result ?? {}) as Record<string, unknown>;
        // PRIORITA: inspection_result.measured_m2 (obhliadkárova presná
        // hodnota z laseru) > data.plocha (pôvodný odhad klienta z formulára).
        // Predtým sa brala len data.plocha → obchodák mal v CP 166 m² klienta,
        // hoci obhliadkár nameral 45.
        const measuredM2 =
          typeof insp.measured_m2 === "number" && insp.measured_m2 > 0
            ? insp.measured_m2
            : null;
        const m2 =
          measuredM2 !== null
            ? String(measuredM2)
            : typeof data.plocha === "string" || typeof data.plocha === "number"
              ? String(data.plocha)
              : "";
        const floorType = mapFloorType(data.typ_podlahy);

        leadContext = {
          id: lead.id as string,
          name: lead.name as string,
          email: (lead.email as string) ?? null,
          phone: (lead.phone as string) ?? null,
          m2,
          floor_type: floorType,
          lokalita: typeof data.lokalita === "string" ? data.lokalita : null,
          priestor: typeof data.priestor === "string" ? data.priestor : null,
          // True ak lead má inspection_result — otvoril sa cez /obhliadnute
          // "Poslať cenovú ponuku". Ovplyvňuje redirect po CP send: ide
          // späť do Finálna CP tabu miesto /agent.
          hasInspection: !!lead.inspection_result,
        };

        // Ak lead má uloženú predchádzajúcu CP a klient prišiel s ?resend=1,
        // hydrátujeme generátor z last_quote.
        if (
          params.resend === "1" &&
          data.last_quote &&
          typeof data.last_quote === "object"
        ) {
          savedQuote = data.last_quote as SavedQuoteState;
        }
      }
    } catch (e) {
      console.error("[generator] lead fetch failed:", e);
    }
  }

  return (
    <GeneratorClient
      leadContext={leadContext}
      agentInfo={agentInfo}
      savedQuote={savedQuote}
      materialMarkups={materialMarkups}
      priceOverrides={priceOverrides}
      systemPriceOverrides={systemPriceOverrides}
      systems={systems}
    />
  );
}
