import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FloorType } from "@/lib/data/materials";

import { GeneratorClient, type LeadContext } from "./generator-client";

// runtime = "edge" disabled — admin client fetch fails in dev edge runtime

export const metadata: Metadata = {
  title: "Generátor ponúk · BDSManager",
};

interface PageProps {
  searchParams: Promise<{ lead?: string; demo?: string }>;
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

  // ─── Demo mock leads (no DB needed) ──────────────────────────────────
  if (params.demo && DEMO_LEADS[params.demo]) {
    leadContext = DEMO_LEADS[params.demo];
    return (
      <GeneratorClient leadContext={leadContext} agentInfo={agentInfo} />
    );
  }

  // ─── Real lead from DB ───────────────────────────────────────────────
  if (params.lead) {
    try {
      const supabase = createAdminClient();
      const { data: lead } = await supabase
        .from("leads")
        .select("id, name, email, phone, data")
        .eq("id", params.lead)
        .maybeSingle();

      if (lead) {
        const data = (lead.data ?? {}) as Record<string, string | number>;
        const m2 =
          typeof data.plocha === "string" || typeof data.plocha === "number"
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
        };
      }
    } catch (e) {
      console.error("[generator] lead fetch failed:", e);
    }
  }

  return <GeneratorClient leadContext={leadContext} agentInfo={agentInfo} />;
}
