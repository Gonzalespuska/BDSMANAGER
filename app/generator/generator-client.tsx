"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Info,
  Mail,
  Percent,
  Search,
  Settings,
  User as UserIcon,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CityAutocomplete } from "@/components/ui/city-autocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calcLine,
  FLOOR_TYPE_ACCUSATIVE,
  FLOOR_TYPE_LABELS,
  FLOOR_TYPE_META,
  formatEur,
  getMaterialsByFloorType,
  getVolumeDiscountTier,
  MATERIALS,
  type FloorType,
  type Material,
} from "@/lib/data/materials";
import { applyMargin, MARZA_MATERIAL } from "@/lib/data/pricing";
import { PRODUCT_CATALOG, type Product } from "@/lib/data/product-catalog";
import {
  calcDays,
  calcTransport,
  getCityDistanceKm,
  HQ_NAME,
} from "@/lib/data/transport";
import { cn } from "@/lib/utils";
import { formatPhoneIntl } from "@/lib/phone-format";

interface LineState {
  enabled: boolean;
  m2: string;
  mm: string;
  poolable?: boolean;
  /** Custom label pre pomenovanú zložku (napr. "Doprava 200 km"). */
  customLabel?: string;
}

export interface LeadContext {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  m2: string; // pre-filled z data.plocha
  floor_type: FloorType | null;
  lokalita: string | null;
  priestor: string | null;
}

/** Snapshot generátorového stavu — ukladá sa do lead.data.last_quote
 * pri odoslaní CP. Používa sa na "Upraviť CP a poslať znova" flow. */
export interface SavedQuoteState {
  version?: number;
  sent_at?: string;
  sent_to?: string;
  subject?: string;
  agent_id?: string;
  state: {
    floorType: FloorType | null;
    saleMode: "realizacia" | "material";
    lines: Record<string, LineState>;
    lokalita: string;
    manualKm: string;
    customerName: string;
    customerEmail: string;
    jednofarebnaVariant: "epoxid" | "polyuretan";
    materialQtys: Record<string, string>;
    discountEnabled: boolean;
    discountAmount: string;
    discountLabel: string;
  };
  snapshot?: {
    total: number;
    subtotal: number;
  };
}

export function GeneratorClient({
  leadContext,
  agentInfo,
  savedQuote,
}: {
  leadContext?: LeadContext | null;
  agentInfo?: { name: string; email: string; phone?: string | null };
  /** Ak lead už má odoslanú CP a otvárame ju cez ?resend=1 — pre-fillneme state. */
  savedQuote?: SavedQuoteState | null;
}) {
  const router = useRouter();
  const isResend = !!savedQuote;
  const [floorType, setFloorType] = React.useState<FloorType | null>(
    savedQuote?.state.floorType ?? leadContext?.floor_type ?? null,
  );
  const initialM2 = leadContext?.m2 ?? "";
  const [lines, setLines] = React.useState<Record<string, LineState>>(() => {
    // Ak máme saved quote → hydrátujeme z neho, ale zabezpečíme že všetky
    // materiály z aktuálneho MATERIALS mapy majú entry (schéma sa mohla zmeniť).
    if (savedQuote?.state.lines) {
      const init: Record<string, LineState> = {};
      for (const m of MATERIALS) {
        init[m.id] = savedQuote.state.lines[m.id] ?? {
          enabled: false,
          m2: "",
          mm: m.unit === "level" ? String(m.default_mm ?? m.min_mm ?? 4) : "0",
        };
      }
      return init;
    }
    const init: Record<string, LineState> = {};
    for (const m of MATERIALS) {
      const isAreaUnit = m.unit === "area" || m.unit === "level";
      // default_enabled má prednosť; ak nie je nastavené, !optional je default
      const defaultEnabled =
        typeof m.default_enabled === "boolean"
          ? m.default_enabled
          : !m.optional;
      init[m.id] = {
        // Zložka (surcharge) je vždy v init vypnutá — obchodák ju aktívne pridá
        enabled: m.unit === "surcharge" ? false : defaultEnabled,
        m2:
          isAreaUnit && m.floor_type === leadContext?.floor_type
            ? initialM2
            : "",
        mm:
          m.unit === "level"
            ? String(m.default_mm ?? m.min_mm ?? 4)
            : "0",
      };
    }
    return init;
  });
  const [margin] = React.useState<string>("0"); // marža je preč, total = subtotal
  const [adminMode, setAdminMode] = React.useState(false);
  const [bulkM2] = React.useState<string>(initialM2);
  const [busy, setBusy] = React.useState(false);
  // Edit-before-send modal state — user klikne malé tužka tlačidlo,
  // otvorí sa modal s pre-fillnutym textom, kde si môže doplniť
  // vlastný text pred odoslaním.
  const [editOpen, setEditOpen] = React.useState(false);
  const [editBody, setEditBody] = React.useState("");
  const [editPayload, setEditPayload] = React.useState<{
    subject: string;
    bodyText: string;
    pdfBase64: string;
    filename: string;
    quoteStateSnapshot: SavedQuoteState;
    input: {
      agent_name: string;
      agent_email: string;
      agent_phone?: string;
    };
  } | null>(null);
  // Lokalita zákazky = miesto realizácie (na transport), NIE home adresa zákazníka.
  // Necháme prázdne aj keď lead má lokalitu vo formulári — agent si po telefonáte
  // explicitne potvrdí kam ide robiť. Pôvodnú hodnotu z leadu ponúkneme ako
  // klikateľný suggestion chip pod inputom.
  const [lokalita, setLokalita] = React.useState<string>(
    savedQuote?.state.lokalita ?? "",
  );
  const [manualKm, setManualKm] = React.useState<string>(
    savedQuote?.state.manualKm ?? "",
  );
  const leadSuggestedLokalita = leadContext?.lokalita ?? "";
  // Email zákazníka — prefilled z leadu, ale editovateľný (môžeš ho meniť
  // alebo zadať manuálne keď generátor otvoríš bez leadu).
  const [customerEmail, setCustomerEmail] = React.useState<string>(
    savedQuote?.state.customerEmail ?? leadContext?.email ?? "",
  );
  // Meno zákazníka — rovnaké, prefilled ale editovateľné
  const [customerName, setCustomerName] = React.useState<string>(
    savedQuote?.state.customerName ?? leadContext?.name ?? "",
  );
  // Voliteľná zľava — opt-in (klikneš na sekciu aby si ju aktivoval, ako optional op)
  const [discountEnabled, setDiscountEnabled] = React.useState<boolean>(
    savedQuote?.state.discountEnabled ?? false,
  );
  const [discountAmount, setDiscountAmount] = React.useState<string>(
    savedQuote?.state.discountAmount ?? "",
  );
  const [discountLabel, setDiscountLabel] = React.useState<string>(
    savedQuote?.state.discountLabel ?? "Špeciálna zľava pre vás",
  );

  // Mode: realizácia podlahy vs iba predaj materiálu + doprava
  const [saleMode, setSaleMode] = React.useState<"realizacia" | "material">(
    savedQuote?.state.saleMode ?? "realizacia",
  );
  // Pre jednofarebnú: voľba medzi Polyuretán (default) a Epoxid farebným náterom
  const [jednofarebnaVariant, setJednofarebnaVariant] = React.useState<
    "epoxid" | "polyuretan"
  >(savedQuote?.state.jednofarebnaVariant ?? "polyuretan");
  // Pre material mode: count balení / kg per produkt (id -> qty string)
  const [materialQtys, setMaterialQtys] = React.useState<
    Record<string, string>
  >(savedQuote?.state.materialQtys ?? {});

  // Subtotal pre material mode — pre každý produkt:
  //   ks balenia × cena/balenie  ALEBO  kg × cena/kg
  // Aplikuje sa MARZA_MATERIAL na predaj.
  const materialOnlySubtotal = React.useMemo(() => {
    if (saleMode !== "material") return 0;
    let cost = 0;
    for (const p of PRODUCT_CATALOG) {
      const qty = parseFloat(materialQtys[p.id] ?? "") || 0;
      if (qty <= 0) continue;
      // Skip produktov bez ceny — nepočítame odhady
      if (p.sell_by === "package" && p.cost_per_package !== null) {
        cost += qty * p.cost_per_package;
      } else if (p.sell_by === "kg" && p.cost_per_kg > 0) {
        cost += qty * p.cost_per_kg;
      }
    }
    return applyMargin(cost, MARZA_MATERIAL);
  }, [saleMode, materialQtys]);
  // ref na prvý m² input — aby sme po výbere lokality skočili na neho
  const firstM2Ref = React.useRef<HTMLInputElement | null>(null);
  function focusFirstM2() {
    const el = firstM2Ref.current;
    if (el) {
      el.focus();
      el.select();
    }
  }

  // ─── Dynamické pomenované zložky ───────────────────────────────────
  // Extra "Zložka" riadky nad rámec built-in. Keď obchodák naplní poslednú,
  // pridá sa nová prázdna. Keď stratí focus s prázdnou → zmizne.
  // Guard proti infinite loop-u: useMemo pre materials + effect ktorý
  // sleduje IBA lines[lastId].customLabel/m2 (nie celý materials array).
  const [extraSurchargeIds, setExtraSurchargeIds] = React.useState<string[]>([]);

  const makeExtraSurcharge = React.useCallback(
    (id: string, ft: FloorType): Material => ({
      id,
      floor_type: ft,
      name: "Zložka",
      unit: "surcharge",
      price_per_sqm: 0,
      unit_label: "€",
      optional: true,
      requires_label: true,
    }),
    [],
  );

  // Materials pre vybraný floor type. Pri jednofarebnej filtrujem aktívny
  // variant (epoxid alebo polyuretán), ostatné variants sa nepočítajú.
  // useMemo aby sa referencia nezmenila na každom rendere → effect nižšie
  // nebude infinite loop.
  const materials = React.useMemo(() => {
    if (!floorType) return [];
    const base = getMaterialsByFloorType(floorType).filter((m) => {
      if (!m.variant) return true;
      return m.variant === jednofarebnaVariant;
    });
    const extras = extraSurchargeIds.map((id) =>
      makeExtraSurcharge(id, floorType),
    );
    return [...base, ...extras];
  }, [floorType, jednofarebnaVariant, extraSurchargeIds, makeExtraSurcharge]);

  // Ensure lines má entry pre každý extra ID
  React.useEffect(() => {
    if (extraSurchargeIds.length === 0) return;
    setLines((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of extraSurchargeIds) {
        if (!next[id]) {
          next[id] = { enabled: false, m2: "", mm: "0", customLabel: "" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [extraSurchargeIds]);

  // AUTO-GROW: keď posledná surcharge (built-in alebo extra) má content,
  // pridaj novú prázdnu. Sledujeme IBA obsah poslednej — nie celý materials
  // array. Idempotent (opakované volanie nič nezmení).
  const lastSurchargeInfo = React.useMemo(() => {
    if (!floorType) return { id: null, hasContent: false };
    const surcharges = materials.filter(
      (m) => m.unit === "surcharge" && m.requires_label,
    );
    if (surcharges.length === 0) return { id: null, hasContent: false };
    const last = surcharges[surcharges.length - 1];
    const line = lines[last.id];
    const hasContent =
      !!line?.customLabel?.trim() ||
      (parseFloat(line?.m2 ?? "") || 0) > 0;
    return { id: last.id, hasContent };
  }, [materials, lines, floorType]);

  React.useEffect(() => {
    if (!floorType) return;
    if (!lastSurchargeInfo.id) return;
    if (!lastSurchargeInfo.hasContent) return;
    // Pridaj novú prázdnu extra — funkčný setter, nič ak sa nič nemení
    setExtraSurchargeIds((prev) => {
      const newId = `${floorType}-zlozka-extra-${
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
      }`;
      return [...prev, newId];
    });
    // Guard: dependencies iba na id + hasContent (dve booleanish hodnoty).
    // Keď sa pridá extra, lastSurchargeInfo.id sa zmení a hasContent bude
    // false (nová prázdna) → efect nič neurobí → žiadny infinite loop.
  }, [lastSurchargeInfo.id, lastSurchargeInfo.hasContent, floorType]);

  // BLUR CLEANUP — helper ktorý zavoláme z LineRow-u keď stratí focus.
  const removeEmptyExtraSurcharge = React.useCallback(
    (id: string) => {
      // setTimeout aby sme dali React čas dokončiť focus transition.
      setTimeout(() => {
        setExtraSurchargeIds((prev) => {
          if (!prev.includes(id)) return prev;
          // Odstrániť iba ak NIE JE posledná (poslednú necháme ako hint).
          const idx = prev.indexOf(id);
          if (idx === prev.length - 1) return prev;
          // A iba ak je stále prázdna.
          const line = lines[id];
          const isEmpty =
            !line?.customLabel?.trim() &&
            !((parseFloat(line?.m2 ?? "") || 0) > 0);
          if (!isEmpty) return prev;
          return prev.filter((x) => x !== id);
        });
      }, 250);
    },
    [lines],
  );
  // Silence unused warning ak sa handler ešte nepoužíva v LineRow.
  void removeEmptyExtraSurcharge;

  // Synchronizácia m² medzi všetkými operáciami danej podlahy. Iteruje
  // cez všetky materiály daného floor_type (vrátane neaktívnych variantov
  // ako polyuretán), aby sa po prepnutí variantu m² nevynulovala.
  //
  // Iba doplní m² — nemení enabled state. Materiály ktorých default je
  // VYPNUTÝ (napr. Vrchný lak epoxid) zostanú vypnuté; user ich musí
  // manuálne zapnúť klikom na kartu.
  function setRequiredM2(value: string) {
    if (!floorType) return;
    setLines((prev) => {
      const next = { ...prev };
      for (const m of getMaterialsByFloorType(floorType)) {
        // Skip count (prasklíny) a surcharge (zložka — EUR, nie m²)
        if (m.unit === "count" || m.unit === "surcharge") continue;
        if (!next[m.id]) continue;
        next[m.id] = { ...next[m.id], m2: value };
      }
      return next;
    });
  }

  // Helper: pri prvom kliknutí na typ podlahy doplníme m² z lead contextu
  // (len pre area/level materiály — count materiály ako Zošívanie nedostávajú m²).
  function selectFloorType(type: FloorType) {
    setFloorType(type);
    if (initialM2 && (!floorType || floorType !== type)) {
      setLines((prev) => {
        const next = { ...prev };
        for (const m of MATERIALS) {
          const isAreaUnit = m.unit === "area" || m.unit === "level";
          if (
            isAreaUnit &&
            m.floor_type === type &&
            next[m.id] &&
            !next[m.id].m2
          ) {
            next[m.id] = { ...next[m.id], m2: initialM2 };
          }
        }
        return next;
      });
    }
  }

  // Bulk action: nastaví m² všetkým povolením riadkom v aktuálnom type
  function applyBulkM2() {
    const m2 = bulkM2.trim();
    if (!m2) return;
    setLines((prev) => {
      const next = { ...prev };
      for (const m of materials) {
        // Zložka má v "m2" EUR sumu, nie m² — nepretrhuj ju.
        if (m.unit === "surcharge") continue;
        if (next[m.id].enabled) {
          next[m.id] = { ...next[m.id], m2 };
        }
      }
      return next;
    });
  }

  // Calculations
  const calcs = materials.map((m) => {
    const ls = lines[m.id];
    if (!ls.enabled) return { m, calc: null };
    const m2 = parseFloat(ls.m2) || 0;
    const mm = parseFloat(ls.mm) || 0;
    // Pomenovaná zložka bez labelu = ignorujeme (UI vynúti zadať text).
    // Inak by sa na PDF objavil generický "Pomenovaná zložka" riadok.
    if (m.requires_label && !(ls.customLabel?.trim())) {
      return { m, calc: null };
    }
    return { m, calc: calcLine(m, m2, mm, ls.customLabel) };
  });

  // Subtotal = súčet predajných cien všetkých povolených riadkov.
  // Sadzby v Material sú UŽ FINÁLNE — calcLine vracia rovno predajnú cenu.
  const subtotalRaw = calcs.reduce((s, c) => s + (c.calc?.total ?? 0), 0);

  // ─── Množstevná zľava (automatický volume discount podľa m²) ──────────
  // Pri 100/300/500/1000+ m² dostane zákazník automaticky 3/6/10/15% zľavu
  // (tiery sú v lib/data/materials.ts). Aplikuje sa na subtotal predtým
  // než sa pridá margin alebo špeciálna zľava.
  const effectiveM2 = (() => {
    const firstReq = materials.find((m) => !m.optional);
    if (!firstReq) return 0;
    return parseFloat(lines[firstReq.id]?.m2 ?? "") || 0;
  })();
  const volumeTier = getVolumeDiscountTier(effectiveM2);
  const volumeDiscountValue = subtotalRaw * (volumeTier.discount_pct / 100);
  const subtotal = subtotalRaw - volumeDiscountValue;

  const marginPercent = parseFloat(margin) || 0;
  const marginValue = subtotal * (marginPercent / 100);

  // ─── Doprava + dĺžka realizácie ──────────────────────────────────────
  const cityKm = getCityDistanceKm(lokalita);
  const manualKmValue = parseFloat(manualKm) || 0;
  // Hierarchia: 1) zoznam miest → 2) manual override ak obchodník zadal,
  // a ak mesto nie je v zozname → manual je hlavný zdroj.
  const kmOneWay =
    cityKm != null && manualKmValue === 0
      ? cityKm
      : manualKmValue > 0
        ? manualKmValue
        : null;
  const showManualKmInput = lokalita.trim().length > 0 && cityKm == null;
  const transport = kmOneWay != null ? calcTransport(kmOneWay) : null;
  // m² pre dni počítame z prvého povinného (úprava povrchu)
  const requiredM2Value = (() => {
    const firstReq = materials.find(
      (m) => !m.optional && true /* flat_price odstránené */,
    );
    if (!firstReq) return 0;
    return parseFloat(lines[firstReq.id]?.m2 ?? "") || 0;
  })();
  const days = calcDays(requiredM2Value);

  // Operácie subtotal — BEZ dopravy. Na túto časť aplikujeme min order.
  const opsSubtotal =
    saleMode === "material" ? materialOnlySubtotal : subtotal + marginValue;
  // Doprava sa NEPRIPOČÍTAVA k manuálnej CP (iba surcharge, žiadna klasická
  // m² plocha) — obchodník robí voľné nacenenie ktoré má byť presne.
  // Ak obchodník chce pridať dopravu k manual CP, urobí to cez ďalšiu
  // pomenovanú zložku (napr. "Doprava 200 km" 90 €).
  const isManualQuote = saleMode === "realizacia" && requiredM2Value <= 0;
  const transportTotal = transport && !isManualQuote ? transport.total_eur : 0;

  // Cap per m² bol odstránený — cena sa počíta z reálnych sadzieb + dopravy
  // bez umelého stropu. Ak zákazka vyjde nad "trhovú" cenu, obchodník to
  // rieši cez špeciálnu zľavu manuálne.

  const rawTotal = opsSubtotal + transportTotal;

  // Má user reálny vstup? Bez rozmeru (m²) v realizácii alebo bez balení
  // v material móde → ponuka nie je validná, nepočítame výslednú cenu.
  // ALE: ak je aspoň jedna zložka (surcharge) enabled s > 0 €, tiež OK —
  // obchodník môže robiť PDF iba na "Lokálnu opravu" bez úpravy povrchu.
  const hasRealInput =
    saleMode === "material"
      ? Object.values(materialQtys).some((v) => (parseFloat(v) || 0) > 0)
      : requiredM2Value > 0 || subtotalRaw > 0;

  // ─── Skrytá zložka — obchodák si dá manuálny markup na finálnu cenu ──
  // Skrytá zložka má PRIORITU nad min-order noise. Ak obchodák chce round-up
  // (napr. z 1019.92 pridať 8c na 1020), pripočíta sa na vrchol total-u,
  // nie do noise-range-u kde by ju systém prepísal.
  const hiddenSurchargeTotal = calcs
    .filter((c) => c.m.hidden_in_pdf && lines[c.m.id]?.enabled && c.calc)
    .reduce((s, c) => s + (c.calc?.total ?? 0), 0);

  // ─── Minimálna objednávka: pseudo-noise 1001.50–1028.50 € ─────────────
  // Neopiliteľne vyzerá krajšie ako guľatých 1000. Deterministické z hash-u
  // (rovnaký input = rovnaká hodnota). Aplikuje sa iba na časť BEZ skrytej
  // zložky. Skrytá zložka sa pridá na vrchol → obchodák dostane presnú cenu.
  const minOrderFloor = React.useMemo(() => {
    const MIN = 1000;
    if (!hasRealInput) return 0;
    // Manuálna CP (iba surcharge, žiadna m² plocha) → min order NEPLATÍ
    if (requiredM2Value <= 0) return 0;
    const hashStr = `${saleMode}|${floorType ?? ""}|${requiredM2Value}|${Object.entries(
      materialQtys,
    )
      .map(([k, v]) => `${k}:${v}`)
      .join(",")}`;
    let h = 0;
    for (let i = 0; i < hashStr.length; i++) {
      h = (h * 31 + hashStr.charCodeAt(i)) | 0;
    }
    const norm = (Math.abs(h) % 10000) / 10000;
    return MIN + 1.5 + norm * 27;
  }, [saleMode, floorType, requiredM2Value, materialQtys, hasRealInput]);

  const rawOps = opsSubtotal + transportTotal;
  // Priorita:
  //   1. Skrytá zložka VŽDY vyhráva — pripočíta sa na finálny total navrch
  //   2. Min-order noise (1001.50–1028.50 €) sa aplikuje IBA na base
  //      (rawOps bez skrytej zložky)
  // Príklad: rawOps bez skrytej = 950, noise = 1019.92, skrytá = 0.08
  //   → base = max(950 - hidden, noise) = 1019.92
  //   → total = 1019.92 + 0.08 = 1020.00 ✓
  const rawOpsWithoutHidden = rawOps - hiddenSurchargeTotal;
  const baseWithMinOrder = hasRealInput
    ? Math.max(rawOpsWithoutHidden, minOrderFloor)
    : 0;
  const total = hasRealInput ? baseWithMinOrder + hiddenSurchargeTotal : 0;
  // Doprava skutočne účtovaná — real transport + prípadný min-order top-up
  // (hidden surcharge sa NEnasčítava sem — má vlastný display).
  const effectiveTransport = hasRealInput
    ? Math.max(0, baseWithMinOrder - (opsSubtotal - hiddenSurchargeTotal))
    : 0;

  // ─── PDF + Email actions ─────────────────────────────────────────────
  async function buildPdfInput() {
    const { generateQuotePdf } = await import("@/lib/quote/generate-pdf");

    // Zložka (hidden_in_pdf) — vyfiltruj zo zobrazenia v PDF, ale jej sumu
    // proporcionálne rozpočítaj medzi viditeľné area-based riadky (úprava,
    // penetrácia, náter, lak ...). Zákazník vidí len mierne navýšené ceny
    // konkrétnych operácií, nie samostatný "zložka €" riadok.
    const allCalcs = calcs
      .map((c) => c.calc)
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const hiddenIds = new Set(
      calcs
        .filter((c) => c.m.hidden_in_pdf && lines[c.m.id]?.enabled)
        .map((c) => c.m.id),
    );

    const visibleCalcs = allCalcs.filter(
      (c) => !hiddenIds.has(c.material_id),
    );
    const hiddenSum = allCalcs
      .filter((c) => hiddenIds.has(c.material_id))
      .reduce((s, c) => s + c.total, 0);

    let pdfLines = visibleCalcs;
    if (hiddenSum > 0 && visibleCalcs.length > 0) {
      const visibleSum = visibleCalcs.reduce((s, c) => s + c.total, 0);
      if (visibleSum > 0) {
        pdfLines = visibleCalcs.map((c) => ({
          ...c,
          total: c.total + hiddenSum * (c.total / visibleSum),
          material_cost: c.material_cost + hiddenSum * (c.total / visibleSum),
        }));
      }
    }

    return {
      generator: generateQuotePdf,
      input: {
        customer_name: customerName.trim() || "Zákazník",
        customer_email: customerEmail.trim() || null,
        customer_phone: leadContext?.phone ?? null,
        customer_lokalita: leadContext?.lokalita ?? null,
        customer_priestor: leadContext?.priestor ?? null,
        floor_type_label: floorType ? FLOOR_TYPE_LABELS[floorType] : "",
        lines: pdfLines,
        subtotal_material: subtotal,
        subtotal_work: 0,
        margin_percent: marginPercent,
        margin_value: marginValue,
        total,
        agent_name: agentInfo?.name ?? "Obchodák Epoxidovo",
        agent_email: agentInfo?.email ?? "info@epoxidovo.sk",
        agent_phone: agentInfo?.phone ?? undefined,
        discount_amount: discountEnabled ? parseFloat(discountAmount) || 0 : 0,
        discount_label: discountLabel || "Špeciálna zľava pre vás",
      },
    };
  }

  async function handleDownloadPdf() {
    setBusy(true);
    try {
      const { generator, input } = await buildPdfInput();
      const { blob, filename } = generator(input);
      const { downloadBlob, previewBlob } = await import(
        "@/lib/quote/generate-pdf"
      );
      // Otvor PDF v novom tabe na náhľad + stiahni súbor.
      previewBlob(blob);
      downloadBlob(blob, filename);
    } catch (e) {
      alert(`PDF chyba: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Zostaví telo emailu, PDF, subject a snapshot. Volá sa z:
   *   • handleSendEmail() — priamy send
   *   • handleOpenEditor() — otvorí modal s tymto ako default
   */
  async function preparePayload(recipient: string): Promise<{
    subject: string;
    bodyText: string;
    pdfBase64: string;
    filename: string;
    quoteStateSnapshot: SavedQuoteState;
    input: Awaited<ReturnType<typeof buildPdfInput>>["input"];
  } | null> {
    const { generator, input } = await buildPdfInput();
    const { blob, filename } = generator(input);
    const subject = `EPOXIDOVO.SK – Cenová ponuka`;
    const accusative =
      floorType && FLOOR_TYPE_ACCUSATIVE[floorType]
        ? FLOOR_TYPE_ACCUSATIVE[floorType]
        : input.floor_type_label.toLowerCase();
    const signatureLines = [
      input.agent_name,
      input.agent_phone ? formatPhoneIntl(input.agent_phone) : null,
      "EPOXIDOVO s. r. o.",
      input.agent_email,
      "www.epoxidovo.sk",
    ].filter(Boolean);
    const bodyText = `Dobrý deň prajeme,

Na základe nášho telefonátu Vám v prílohe posielam ORIENTAČNÚ cenovú ponuku na ${accusative} podlahu.

Upozorňujeme, že ide o orientačné ceny — presná cenová ponuka bude vyčíslená až po obhliadke. V závislosti od stavu podkladu sa cena môže líšiť o niekoľko percent (viac alebo menej).

V prípade akýchkoľvek otázok ma neváhajte kontaktovať.

S pozdravom,
${signatureLines.join("\n")}`;
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const pdfBase64 = btoa(binary);
    const quoteStateSnapshot: SavedQuoteState = {
      version: (savedQuote?.version ?? 0) + 1,
      sent_at: new Date().toISOString(),
      sent_to: recipient,
      subject,
      agent_id: undefined,
      state: {
        floorType,
        saleMode,
        lines,
        lokalita,
        manualKm,
        customerName,
        customerEmail,
        jednofarebnaVariant,
        materialQtys,
        discountEnabled,
        discountAmount,
        discountLabel,
      },
      snapshot: { total, subtotal },
    };
    return {
      subject,
      bodyText,
      pdfBase64,
      filename,
      quoteStateSnapshot,
      input,
    };
  }

  /**
   * Klik na malú tužku "Upraviť pred poslaním" — vygeneruje payload
   * (PDF + text) a otvorí modal s editovatelnym textom. Email sa NEPOSIELA
   * kým user neklikne "Poslať" v modáli.
   */
  async function handleOpenEditor() {
    const recipient = customerEmail.trim();
    if (!recipient || !recipient.includes("@")) {
      alert("Email zákazníka chýba alebo nie je validný.");
      return;
    }
    setBusy(true);
    try {
      const payload = await preparePayload(recipient);
      if (!payload) return;
      setEditPayload(payload);
      setEditBody(payload.bodyText);
      setEditOpen(true);
    } catch (e) {
      alert(`Chyba: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  /** Skutočné odoslanie po editácii — volané z modálového „Poslať" button-u. */
  async function handleSendEdited() {
    if (!editPayload) return;
    setBusy(true);
    try {
      const recipient = customerEmail.trim();
      const sendRes = await fetch("/api/quote/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadContext?.id?.startsWith("demo-")
            ? null
            : leadContext?.id ?? null,
          to_email: recipient,
          to_name: customerName.trim() || "Zákazník",
          subject: editPayload.subject,
          body_text: editBody,
          pdf_base64: editPayload.pdfBase64,
          pdf_filename: editPayload.filename,
          agent_email: editPayload.input.agent_email,
          agent_name: editPayload.input.agent_name,
          quote_state: editPayload.quoteStateSnapshot,
        }),
      });
      const sendJson = (await sendRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!sendRes.ok || !sendJson.ok) {
        alert(`❌ Odoslanie zlyhalo: ${sendJson.error ?? "unknown"}`);
        setBusy(false);
        return;
      }
      setEditOpen(false);
      setEditPayload(null);
      alert(
        `✅ Cenová ponuka odoslaná zákazníkovi na ${recipient}.\n\n📎 PDF v prílohe.`,
      );
      router.push("/agent?tab=kontakt");
    } catch (e) {
      alert(`Chyba: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendEmail() {
    const recipient = customerEmail.trim();
    if (!recipient || !recipient.includes("@")) {
      alert(
        "Email zákazníka chýba alebo nie je validný. Vyplň ho v poli vyššie.",
      );
      return;
    }
    setBusy(true);
    try {
      const { generator, input } = await buildPdfInput();
      const { blob, filename } = generator(input);

      const subject = `EPOXIDOVO.SK – Cenová ponuka`;
      // Akuzatív — "na jednofarebnú/chipsovú/mramorovú/metalickú podlahu"
      const accusative =
        floorType && FLOOR_TYPE_ACCUSATIVE[floorType]
          ? FLOOR_TYPE_ACCUSATIVE[floorType]
          : input.floor_type_label.toLowerCase();

      const signatureLines = [
        input.agent_name,
        input.agent_phone ? formatPhoneIntl(input.agent_phone) : null,
        "EPOXIDOVO s. r. o.",
        input.agent_email,
        "www.epoxidovo.sk",
      ].filter(Boolean);
      const bodyText = `Dobrý deň prajeme,

Na základe nášho telefonátu Vám v prílohe posielam ORIENTAČNÚ cenovú ponuku na ${accusative} podlahu.

Upozorňujeme, že ide o orientačné ceny — presná cenová ponuka bude vyčíslená až po obhliadke. V závislosti od stavu podkladu sa cena môže líšiť o niekoľko percent (viac alebo menej).

V prípade akýchkoľvek otázok ma neváhajte kontaktovať.

S pozdravom,
${signatureLines.join("\n")}`;

      // ─── Priamy send cez Resend (backend) — PDF sa auto-priloží ────────
      // Blob → base64 (bez data: prefix). Resend akceptuje raw base64.
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const pdfBase64 = btoa(binary);

      // Snapshot generátorového stavu — uloží sa do lead.data.last_quote,
      // aby obchodník mohol CP neskôr upraviť a poslať znova.
      const quoteStateSnapshot: SavedQuoteState = {
        version: (savedQuote?.version ?? 0) + 1,
        sent_at: new Date().toISOString(),
        sent_to: recipient,
        subject,
        agent_id: undefined,
        state: {
          floorType,
          saleMode,
          lines,
          lokalita,
          manualKm,
          customerName,
          customerEmail,
          jednofarebnaVariant,
          materialQtys,
          discountEnabled,
          discountAmount,
          discountLabel,
        },
        snapshot: { total, subtotal },
      };

      const sendRes = await fetch("/api/quote/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadContext?.id?.startsWith("demo-") ? null : leadContext?.id ?? null,
          to_email: recipient,
          to_name: customerName.trim() || "Zákazník",
          subject,
          body_text: bodyText,
          pdf_base64: pdfBase64,
          pdf_filename: filename,
          agent_email: input.agent_email,
          agent_name: input.agent_name,
          quote_state: quoteStateSnapshot,
        }),
      });

      const sendJson = (await sendRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };

      if (!sendRes.ok || !sendJson.ok) {
        // Fallback: ak Resend zlyhal, ponúkni stiahnutie PDF ako záložný plán
        const { downloadBlob } = await import("@/lib/quote/generate-pdf");
        downloadBlob(blob, filename);
        alert(
          `❌ Automatické odoslanie zlyhalo: ${sendJson.error ?? "unknown"}.\n\n` +
            `PDF som ti stiahol do Downloads — pošli ho manuálne cez Gmail.`,
        );
        setBusy(false);
        return;
      }

      // ✅ Odoslané cez Resend s PDF prílohou
      setTimeout(() => {
        alert(
          `✅ Cenová ponuka odoslaná zákazníkovi na ${recipient}.\n\n` +
            `📎 PDF v prílohe.\n` +
            `📬 Kópia ti prišla do Inboxu (BCC).\n` +
            `↩️ Ak zákazník odpovie, mail príde priamo tebe.`,
        );
        router.push("/agent?tab=kontakt");
      }, 100);
      return; // send flow ends here — legacy Gmail compose flow bol odstránený
    } catch (e) {
      alert(`Email chyba: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 md:gap-2.5">
      {/* RESEND banner — zákazník zmenil rozmery / špec, obchodák upraví
          pôvodnú CP a pošle znova. */}
      {isResend && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-full bg-amber-200 text-amber-900 inline-flex items-center justify-center shrink-0 text-lg">
            ✏️
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-amber-900">
              Upravuješ predošlú CP (verzia {savedQuote?.version ?? 1})
            </div>
            <div className="text-[11px] text-amber-800/80">
              Pôvodná poslaná {savedQuote?.sent_at ? new Date(savedQuote.sent_at).toLocaleString("sk-SK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
              {savedQuote?.sent_to ? ` na ${savedQuote.sent_to}` : ""}
              {savedQuote?.snapshot?.total ? ` · pôvodný total ${formatEur(savedQuote.snapshot.total)}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* Compact header s lead chip + title + mode toggle v jednom riadku.
          Šetrí ~200px vertikálneho miesta na notebookoch. */}
      <div className="flex items-center justify-between gap-2 md:gap-4 flex-wrap">
        {/* Left: title + lead chip */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <h1 className="text-lg md:text-xl lg:text-2xl font-extrabold tracking-tight inline-flex items-center gap-1.5">
            <Calculator className="w-5 h-5 md:w-6 md:h-6 text-sky-500" aria-hidden />
            Generátor ponúk
          </h1>
          {leadContext && (
            <Link
              href={`/agent/leads/${leadContext.id}`}
              className="group inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-50 hover:bg-sky-100 transition-colors pl-1 pr-3 py-1"
              title={`${leadContext.name} • klik pre detail leadu`}
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-sky-500 text-white shrink-0">
                <UserIcon className="w-3.5 h-3.5" aria-hidden />
              </span>
              <span className="text-xs md:text-sm font-bold text-sky-900 truncate max-w-[140px] md:max-w-[200px]">
                {leadContext.name}
              </span>
              {leadContext.phone && (
                <span className="hidden md:inline text-[11px] text-sky-700/80 font-medium tabular-nums">
                  · {leadContext.phone}
                </span>
              )}
              <ArrowLeft className="w-3 h-3 text-sky-600 group-hover:-translate-x-0.5 transition-transform" aria-hidden />
            </Link>
          )}
        </div>

        {/* Right: mode toggle */}
        <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 self-start">
          <button
            type="button"
            onClick={() => setSaleMode("realizacia")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs md:text-sm font-bold transition-colors",
              saleMode === "realizacia"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Realizácia podlahy
          </button>
          <button
            type="button"
            onClick={() => setSaleMode("material")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs md:text-sm font-bold transition-colors",
              saleMode === "material"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Iba materiál + doprava
          </button>
        </div>
      </div>

      {/* Floor type picker — pred výberom veľké fotky; po výbere kompaktné pills */}
      {/* Zobrazí sa v oboch módoch: v realizácii filtruje operácie, v materiáli filtruje katalóg produktov. */}
      {(
      !floorType ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {(Object.keys(FLOOR_TYPE_LABELS) as FloorType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => selectFloorType(type)}
                className="group rounded-xl border border-border bg-background hover:border-foreground/30 text-left transition-all overflow-hidden"
              >
                {/* Aspect ratio scales aggressively:
                    mobile 4:3 vyššie | tablet 16:9 | notebook 24:7 (lg) ultra-thin */}
                <div className="relative aspect-[4/3] md:aspect-video lg:aspect-[24/7] w-full overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/floor-types/${type}.jpg`}
                    alt={FLOOR_TYPE_LABELS[type]}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-2.5 md:p-3">
                  <div className="text-sm md:text-base lg:text-lg font-extrabold tracking-tight">
                    {FLOOR_TYPE_LABELS[type]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        // Kompaktné pills v rade — fotka 40×40 + meno, aby zostalo miesto na zvyšok
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(FLOOR_TYPE_LABELS) as FloorType[]).map((type) => {
            const active = floorType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => selectFloorType(type)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-2 text-left transition-all",
                  active
                    ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200 shadow-sm"
                    : "border-border bg-background hover:border-foreground/30 hover:bg-muted/40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/floor-types/${type}.jpg`}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover shrink-0"
                />
                <span
                  className={cn(
                    "text-sm font-bold tracking-tight",
                    active && "text-sky-800",
                  )}
                >
                  {FLOOR_TYPE_LABELS[type]}
                </span>
              </button>
            );
          })}
        </div>
      )
      )}

      {/* Lokalita + automatická Doprava v jednej karte */}
      {floorType && (
        <div className="rounded-xl border bg-background p-2.5 md:p-3 flex items-end gap-3 md:gap-4 flex-wrap animate-in fade-in duration-300">
          <div className="flex-1 min-w-[220px]">
            <Label
              htmlFor="lokalita"
              className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground"
            >
              Lokalita zákazky — píš mesto, Tab/Enter potvrdí
            </Label>
            <CityAutocomplete
              id="lokalita"
              value={lokalita}
              onChange={setLokalita}
              onComplete={focusFirstM2}
              placeholder="napr. Bratislava"
              autoFocus
              className="mt-1"
            />
          </div>
          {showManualKmInput && (
            <div className="shrink-0">
              <Label
                htmlFor="manual-km"
                className="text-[10px] uppercase tracking-wider font-bold text-amber-700"
              >
                Mesto nie je v zozname — zadaj km
              </Label>
              <div className="mt-1 inline-flex items-center gap-1">
                <Input
                  id="manual-km"
                  type="number"
                  min={0}
                  max={500}
                  value={manualKm}
                  onChange={(e) => setManualKm(e.target.value)}
                  placeholder="napr. 180"
                  className="h-9 w-24 text-sm text-right font-bold tabular-nums"
                />
                <span className="text-xs font-bold text-muted-foreground">km</span>
              </div>
            </div>
          )}
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Doprava
            </div>
            <div className="text-lg font-extrabold text-sky-700 tabular-nums">
              {transport ? formatEur(transport.total_eur) : "—"}
            </div>
            {transport && effectiveTransport > transport.total_eur + 0.5 && (
              <div
                className="text-[9px] text-amber-800 font-semibold mt-0.5 max-w-[140px]"
                title="Rozdiel doplní min. objednávku 1 000 € (fakturačné povinnosť). Doprava samotná = km × sadzba."
              >
                + doplnenie do min. zákazky:{" "}
                <span className="tabular-nums">
                  {formatEur(effectiveTransport - transport.total_eur)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Jednofarebná variant toggle — Polyuretán (default) vs Epoxid */}
      {saleMode === "realizacia" && floorType === "jednofarebna" && (
        <div className="inline-flex rounded-lg border bg-muted/30 p-0.5 self-start">
          <button
            type="button"
            onClick={() => setJednofarebnaVariant("polyuretan")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
              jednofarebnaVariant === "polyuretan"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Polyuretán
          </button>
          <button
            type="button"
            onClick={() => setJednofarebnaVariant("epoxid")}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
              jednofarebnaVariant === "epoxid"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Epoxid
          </button>
        </div>
      )}

      {/* Operations — visible only after floor type chosen (realizácia mode) */}
      {saleMode === "realizacia" && floorType && (
        <OperationsSection
          floorType={floorType}
          calcs={calcs}
          lines={lines}
          setLines={setLines}
          setRequiredM2={setRequiredM2}
          firstM2Ref={firstM2Ref}
          adminMode={adminMode}
        />
      )}

      {/* Material-only catalog — sekciový systém:
            1. Hlavný náter (krok 1) — obchodník vyberie čo robí
            2. Penetrácia (krok 2) — iba kompatibilné s vybraným hlavným
            3. Vrchný lak (krok 3) — voliteľné, iba kompatibilné
            4. Doplnky (samonivel, posyp, čistič, chipsy ...) */}
      {saleMode === "material" && floorType && (
        <MaterialCatalog
          floorType={floorType}
          materialQtys={materialQtys}
          setMaterialQtys={setMaterialQtys}
        />
      )}

      {/* Total bar — visible in oba módy ak je čo počítať */}
      {floorType && (
      <div className="rounded-xl border-2 border-sky-500 bg-sky-50 px-3 md:px-4 py-2.5 md:py-3 shrink-0 shadow-lg">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="text-[11px] text-sky-700/80 leading-snug">
            {days > 0 && (
              <div>
                <span className="font-bold">Realizácia:</span> {days}{" "}
                {days === 1 ? "deň" : days < 5 ? "dni" : "dní"}
              </div>
            )}
            {requiredM2Value > 0 && (
              <div>
                <span className="font-bold">Cena/m²:</span>{" "}
                {formatEur(total / requiredM2Value)}
              </div>
            )}
            {volumeTier.discount_pct > 0 && (
              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-[10px] uppercase tracking-wider">
                ✓ {volumeTier.label} (−{formatEur(volumeDiscountValue)})
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider font-bold text-sky-700">
              Výsledná cena
            </div>
            {discountEnabled && (parseFloat(discountAmount) || 0) > 0 ? (
              <>
                <div className="text-lg font-bold text-muted-foreground line-through tabular-nums">
                  {hasRealInput ? formatEur(total) : "—"}
                </div>
                <div className="text-3xl md:text-4xl font-extrabold text-sky-700 tabular-nums">
                  {hasRealInput
                    ? formatEur(
                        Math.max(0, total - (parseFloat(discountAmount) || 0)),
                      )
                    : "—"}
                </div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Po zľave −{formatEur(parseFloat(discountAmount) || 0)}
                </div>
              </>
            ) : (
              <div className="text-3xl md:text-4xl font-extrabold text-sky-700 tabular-nums">
                {hasRealInput ? formatEur(total) : "—"}
              </div>
            )}
          </div>
        </div>

        {/* Zľava — opt-in toggle. Na obchodáckej strane neutrálna sivá/biela;
            v PDF sa zobrazí ČERVENÝM pre wow-efekt pre zákazníka. */}
        <div
          className={cn(
            "mt-2 pt-2 border-t border-sky-200 rounded-lg transition-all",
            !discountEnabled && "opacity-60",
          )}
        >
          <button
            type="button"
            onClick={() => setDiscountEnabled((v) => !v)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-muted/60 transition-colors",
              discountEnabled && "bg-muted/40",
            )}
          >
            <span
              className={cn(
                "inline-flex items-center justify-center w-5 h-5 rounded border-2 shrink-0 transition-all",
                discountEnabled
                  ? "bg-foreground border-foreground text-background"
                  : "bg-background border-zinc-300",
              )}
              aria-hidden
            >
              {discountEnabled && (
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path d="M2 6.5L4.5 9L10 3" />
                </svg>
              )}
            </span>
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-muted-foreground">
              Špeciálna zľava — kliknutím aktivuj
            </span>
            {discountEnabled && (parseFloat(discountAmount) || 0) > 0 && (
              <span className="ml-auto text-xs font-bold text-foreground tabular-nums">
                −{formatEur(parseFloat(discountAmount) || 0)}
              </span>
            )}
          </button>

          {discountEnabled && (
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              <div>
                <Label
                  htmlFor="discount-amount"
                  className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground"
                >
                  Suma (€)
                </Label>
                <Input
                  id="discount-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={1}
                  placeholder="napr. 200"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  autoFocus
                  className="h-9 text-sm font-bold tabular-nums"
                />
              </div>
              <div>
                <Label
                  htmlFor="discount-label"
                  className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground"
                >
                  Názov (zobrazí sa v PDF červeno)
                </Label>
                <Input
                  id="discount-label"
                  type="text"
                  placeholder="Špeciálna zľava pre vás"
                  value={discountLabel}
                  onChange={(e) => setDiscountLabel(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Customer name + email — prefilled z leadu, ale editovateľné aby si
            mohol odoslať ponuku komukoľvek (aj bez leadu). */}
        <div className="mt-2 pt-2 border-t border-sky-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label
              htmlFor="customer-name"
              className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground inline-flex items-center gap-1"
            >
              Meno zákazníka
              <span className="normal-case tracking-normal font-normal text-muted-foreground/60">
                — voliteľné pre PDF
              </span>
            </Label>
            <Input
              id="customer-name"
              type="text"
              placeholder="voliteľné — bez mena bude 'Zákazník'"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label
              htmlFor="customer-email"
              className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground inline-flex items-center gap-1"
            >
              Email zákazníka
              <span className="normal-case tracking-normal font-normal text-muted-foreground/60">
                — povinný iba pre odoslanie
              </span>
            </Label>
            <Input
              id="customer-email"
              type="email"
              placeholder="voliteľné ak len sťahuješ PDF"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2 mt-2 border-t border-sky-200 flex-wrap">
          <Button
            type="button"
            onClick={handleDownloadPdf}
            disabled={busy || total <= 0}
            variant="outline"
            className="flex-1 min-w-[140px]"
            title="Vygeneruje presne to isté PDF čo posielaš emailom. Meno a email sú voliteľné pri sťahovaní."
          >
            <Download className="w-4 h-4 mr-1.5" aria-hidden />
            <FileText className="w-4 h-4 mr-1" aria-hidden />
            Stiahnuť PDF
          </Button>
          <Button
            type="button"
            onClick={handleSendEmail}
            disabled={
              busy ||
              total <= 0 ||
              !customerEmail.trim() ||
              !customerEmail.includes("@")
            }
            className="flex-1 min-w-[200px] bg-emerald-600 hover:bg-emerald-700"
          >
            <Mail className="w-4 h-4 mr-1.5" aria-hidden />
            {isResend ? "Preposlať upravenú ponuku" : "Pošli email s ponukou"}
          </Button>
          {/* Malé tlačidlo vpravo — otvorí modal na doplnenie textu
              PRED odoslaním. Užitočné keď obchodák chce pridať
              individuálnu poznámku ("dohodli sme sa na X", "kontaktoval
              ma Váš syn", atd.) namiesto generickeho textu. */}
          <Button
            type="button"
            onClick={handleOpenEditor}
            disabled={
              busy ||
              total <= 0 ||
              !customerEmail.trim() ||
              !customerEmail.includes("@")
            }
            variant="outline"
            className="min-w-[44px] px-3 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            title="Upraviť text pred odoslaním"
          >
            ✏️
          </Button>
        </div>
      </div>
      )}

      {/* Edit-before-send modal */}
      {editOpen && editPayload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <header className="px-5 py-3 border-b flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Upraviť email pred odoslaním
                </div>
                <h2 className="font-extrabold text-base">
                  {editPayload.subject}
                </h2>
                <div className="text-xs text-muted-foreground mt-0.5">
                  📎 {editPayload.filename} · Komu:{" "}
                  <strong>{customerEmail}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted"
                aria-label="Zavrieť"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </header>
            <div className="flex-1 overflow-auto p-5">
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1.5">
                📝 Telo emailu
              </label>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={16}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                placeholder="Text emailu..."
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Uprav si text ako chceš — signatúra, oslovenie, cokolvek. PDF
                s cenovou ponukou sa priloží automaticky.
              </p>
            </div>
            <footer className="px-5 py-3 border-t bg-muted/30 flex items-center gap-2 justify-end">
              <Button
                type="button"
                onClick={() => setEditOpen(false)}
                variant="outline"
                size="sm"
              >
                Zrušiť
              </Button>
              <Button
                type="button"
                onClick={handleSendEdited}
                disabled={busy || !editBody.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
                size="sm"
              >
                <Mail className="w-4 h-4 mr-1.5" aria-hidden />
                Poslať
              </Button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
type LineUpdater = LineState | ((prev: LineState) => LineState);

function updateLineFor(
  setLines: React.Dispatch<React.SetStateAction<Record<string, LineState>>>,
  id: string,
) {
  return (arg: LineUpdater) =>
    setLines((prev) => ({
      ...prev,
      [id]: typeof arg === "function" ? arg(prev[id]) : arg,
    }));
}

function OperationsSection({
  floorType,
  calcs,
  lines,
  setLines,
  setRequiredM2,
  firstM2Ref,
  adminMode,
}: {
  floorType: FloorType;
  calcs: { m: Material; calc: ReturnType<typeof calcLine> | null }[];
  lines: Record<string, LineState>;
  setLines: React.Dispatch<React.SetStateAction<Record<string, LineState>>>;
  setRequiredM2: (value: string) => void;
  firstM2Ref?: React.MutableRefObject<HTMLInputElement | null>;
  adminMode: boolean;
}) {
  // Povinné = vždy súčasť realizácie (non-optional, nie flat-price).
  // Optional = zákazník to nemusí mať (zošívanie, nivelácia).
  // Flat-price = softvér počíta sám, obchodník to v UI nevidí, do PDF/totalu ide normálne.
  const requiredCalcs = calcs.filter(
    (c) => !c.m.optional && true /* flat_price odstránené */,
  );
  const optionalCalcs = calcs.filter((c) => c.m.optional);
  const [optionalOpen, setOptionalOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Povinné — kompaktné karty v rade. m² je synchronizovaný cez setRequiredM2. */}
      <div
        className={cn(
          "grid gap-2",
          requiredCalcs.length === 2 && "md:grid-cols-2",
          requiredCalcs.length === 3 && "md:grid-cols-3",
          requiredCalcs.length === 4 && "md:grid-cols-4",
          requiredCalcs.length >= 5 && "md:grid-cols-5",
        )}
      >
        {requiredCalcs.map(({ m, calc }, idx) => {
          const isLast = idx === requiredCalcs.length - 1;
          return (
            <BigBaseRow
              key={m.id}
              material={m}
              state={lines[m.id]}
              onChange={updateLineFor(setLines, m.id)}
              onSyncedM2Change={setRequiredM2}
              calc={calc}
              inputRef={idx === 0 ? firstM2Ref : undefined}
              onSubmitAdvance={
                isLast ? () => setOptionalOpen(true) : undefined
              }
            />
          );
        })}
      </div>


      {/* Voliteľné — collapsible len ak existujú */}
      {optionalCalcs.length > 0 && (
        <div className="rounded-2xl border bg-background overflow-hidden">
          <button
            type="button"
            onClick={() => setOptionalOpen((o) => !o)}
            className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors text-left"
            aria-expanded={optionalOpen}
          >
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-foreground/70 text-xs font-bold">
                {optionalCalcs.filter((c) => lines[c.m.id]?.enabled).length}
              </span>
              <span className="text-sm font-bold uppercase tracking-wider">
                Voliteľné operácie
              </span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {optionalCalcs.map((c) => c.m.name.split(" ")[0]).join(" · ")}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "w-5 h-5 text-muted-foreground transition-transform",
                optionalOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {optionalOpen && (
            <ul className="divide-y border-t">
              {optionalCalcs.map(({ m, calc }) => (
                <LineRow
                  key={m.id}
                  material={m}
                  state={lines[m.id]}
                  onChange={updateLineFor(setLines, m.id)}
                  calc={calc}
                  adminMode={adminMode}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function BigBaseRow({
  material,
  state,
  onChange,
  onSyncedM2Change,
  calc,
  inputRef,
  onSubmitAdvance,
}: {
  material: Material;
  state: LineState;
  onChange: (state: LineUpdater) => void;
  /** Sync m² medzi všetkými povinnými operáciami. Ak je nastavené, m² input ho používa. */
  onSyncedM2Change?: (value: string) => void;
  calc: ReturnType<typeof calcLine> | null;
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
  /** Voláme keď user stlačí Enter/Tab v poslednej povinnej karte → otvor voliteľné. */
  onSubmitAdvance?: () => void;
}) {
  // Display name → "Úprava povrchu" / "Penetrácia" bez zátvorky
  const displayName = material.name.split(" (")[0];
  const subtitle = material.name.match(/\(([^)]+)\)/)?.[1];

  // Toggle enabled stav klikom na hlavičku (mimo m² inputu).
  const toggleEnabled = () => {
    onChange((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-2.5 shadow-sm transition-colors",
        state.enabled
          ? "border-sky-300 bg-sky-50/40"
          : "border-dashed border-muted-foreground/30 bg-muted/20",
      )}
    >
      <button
        type="button"
        onClick={toggleEnabled}
        className="w-full flex items-center justify-between gap-2 text-left"
        title={state.enabled ? "Klik pre vypnutie" : "Klik pre zapnutie"}
      >
        <div className="inline-flex items-center gap-1.5 min-w-0">
          {state.enabled ? (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-bold shrink-0">
              ✓
            </span>
          ) : (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground/50 text-[9px] shrink-0">
              +
            </span>
          )}
          <span
            className={cn(
              "text-sm font-extrabold tracking-tight truncate",
              !state.enabled && "text-muted-foreground",
            )}
          >
            {displayName}
          </span>
        </div>
        <div
          className={cn(
            "text-base font-extrabold tabular-nums shrink-0",
            state.enabled ? "text-sky-700" : "text-muted-foreground/40",
          )}
        >
          {state.enabled ? formatEur(calc?.total ?? 0) : "—"}
        </div>
      </button>
      <div
        className="mt-1.5 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          id={`${material.id}-m2`}
          ref={inputRef}
          type="number"
          inputMode="numeric"
          placeholder="m²"
          value={state.m2}
          onFocus={() => {
            if (!state.enabled) onChange((prev) => ({ ...prev, enabled: true }));
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (onSyncedM2Change) {
              onSyncedM2Change(v);
            } else {
              onChange({ ...state, m2: v });
            }
          }}
          onKeyDown={(e) => {
            if (onSubmitAdvance && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              onSubmitAdvance();
            }
          }}
          className={cn(
            "h-9 text-sm font-bold flex-1",
            !state.enabled && "opacity-50",
          )}
        />
        <span className="text-[11px] font-bold text-muted-foreground">m²</span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function LineRow({
  material,
  state,
  onChange,
  calc,
  adminMode,
}: {
  material: Material;
  state: LineState;
  onChange: (state: LineUpdater) => void;
  calc: ReturnType<typeof calcLine> | null;
  adminMode: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  // Klik kdekoľvek do riadka prepne enabled (toggle). Funkčný update aby
  // čítal aktuálny state.
  const handleRowClick = () => {
    onChange((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  // Auto-enable keď focusneš input alebo začneš písať
  const ensureEnabled = () => {
    onChange((prev) => (prev.enabled ? prev : { ...prev, enabled: true }));
  };

  return (
    <li
      onClick={handleRowClick}
      className={cn(
        "cursor-pointer transition-colors",
        state.enabled
          ? "bg-sky-50/30 hover:bg-sky-50/60"
          : "bg-background hover:bg-sky-50/40 opacity-80 hover:opacity-100",
      )}
    >
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold inline-flex items-center gap-2 flex-wrap">
            {state.enabled ? (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-500 text-white text-[10px] font-bold shrink-0">
                ✓
              </span>
            ) : (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/30 text-muted-foreground/50 text-[10px] shrink-0">
                +
              </span>
            )}
            {material.requires_label ? (
              // Inline-editable title — kliknutím sa "Zložka" zmení na input,
              // obchodník zadá vlastný názov (napr. "Doprava 200 km"). Bez
              // názvu sa do total nezapočíta (varovanie pod inputom).
              <span
                className="inline-flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <Input
                  type="text"
                  value={state.customLabel ?? ""}
                  onFocus={ensureEnabled}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange((prev) => ({ ...prev, customLabel: v }));
                  }}
                  placeholder="Pomenovaná zložka"
                  aria-label="Názov zložky (zobrazí sa na cenovej ponuke)"
                  className={cn(
                    "h-8 text-sm font-semibold w-64",
                    !state.customLabel?.trim() &&
                      state.enabled &&
                      "border-amber-300 bg-amber-50/30",
                  )}
                />
                {state.enabled && !state.customLabel?.trim() && (
                  <span
                    className="text-[9px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded"
                    title="Bez názvu sa nepripočíta do ceny — pomenuj zložku"
                  >
                    pomenuj
                  </span>
                )}
              </span>
            ) : (
              material.name
            )}
            {material.optional && !material.requires_label && (
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                voliteľné
              </span>
            )}
          </div>
        </div>

        {/* Zložka — len EUR input + badge (label input je INLINE v titulku).
            - requires_label → modrý "NA FA" badge (viditeľná na PDF s názvom)
            - hidden_in_pdf  → žltý "SKRYTÉ" badge (markup pre kokotov) */}
        {material.unit === "surcharge" && (
          <div
            className="inline-flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-bold text-muted-foreground">€</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              placeholder="0"
              value={state.m2}
              onFocus={ensureEnabled}
              onChange={(e) => {
                const v = e.target.value;
                onChange((prev) => ({
                  ...prev,
                  m2: v,
                  enabled: (parseFloat(v) || 0) > 0,
                }));
              }}
              className="h-9 w-24 text-sm text-right font-bold tabular-nums"
            />
            {material.hidden_in_pdf ? (
              <span
                className="text-[9px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded"
                title="Skryté v cenovej ponuke — len započítané v celkovej cene"
              >
                skryté
              </span>
            ) : (
              <span
                className="text-[9px] uppercase tracking-wider font-bold text-sky-700 bg-sky-50 border border-sky-200 px-1 py-0.5 rounded"
                title="Viditeľné na PDF cenovej ponuke a faktúre s vlastným názvom"
              >
                na FA
              </span>
            )}
          </div>
        )}

        {/* m² + mm inputy.  Klik / focus / type auto-enabne. */}
        {material.unit !== "count" && material.unit !== "surcharge" && (
            <>
              <div className="w-24" onClick={(e) => e.stopPropagation()}>
                <Input
                  type="number"
                  placeholder="m²"
                  value={state.m2}
                  onFocus={ensureEnabled}
                  onChange={(e) => {
                    ensureEnabled();
                    onChange({ ...state, m2: e.target.value, enabled: true });
                  }}
                  className="h-9 text-sm"
                />
              </div>

              {material.unit === "level" && (
                <div
                  className="inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={material.min_mm ?? 0}
                    step={1}
                    placeholder="mm"
                    value={state.mm}
                    onFocus={ensureEnabled}
                    onChange={(e) => {
                      ensureEnabled();
                      onChange({
                        ...state,
                        mm: e.target.value,
                        enabled: true,
                      });
                    }}
                    onBlur={(e) => {
                      // Clamp na minimum pri blure (napr. 4 mm pre nivelaciu)
                      const v = parseFloat(e.target.value) || 0;
                      const minMm = material.min_mm ?? 0;
                      if (v < minMm) {
                        onChange((prev) => ({ ...prev, mm: String(minMm) }));
                      }
                    }}
                    className="h-9 w-16 text-sm text-center font-bold"
                  />
                  <span className="text-[10px] font-bold text-muted-foreground">
                    mm
                  </span>
                  {material.min_mm != null && (
                    <span
                      className="text-[9px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded"
                      title={`Minimum ${material.min_mm} mm (pod ${material.min_mm} mm vrstva praská)`}
                    >
                      min {material.min_mm}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

        {/* Counter +/- pri unit="count" (napr. počet prasklín pre Zosívanie). */}
        {material.unit === "count" && (
          <div
            className="inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange((prev) => {
                  const cur = Math.max(0, Math.floor(parseFloat(prev.m2) || 0));
                  const next = Math.max(0, cur - 1);
                  return {
                    ...prev,
                    m2: String(next),
                    enabled: next > 0 ? true : prev.enabled,
                  };
                });
              }}
              className="w-8 h-8 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none"
              aria-label="Menej"
            >
              −
            </button>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={state.m2}
              onFocus={ensureEnabled}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                onChange((prev) => ({
                  ...prev,
                  m2: v,
                  enabled: parseInt(v || "0") > 0,
                }));
              }}
              className="h-8 w-14 text-center text-sm font-bold tabular-nums"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange((prev) => {
                  const cur = Math.max(0, Math.floor(parseFloat(prev.m2) || 0));
                  return {
                    ...prev,
                    m2: String(cur + 1),
                    enabled: true,
                  };
                });
              }}
              className="w-8 h-8 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none"
              aria-label="Viac"
            >
              +
            </button>
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground ml-1">
              {material.unit_label ?? "ks"}
              {material.price_per_unit
                ? ` · ${formatEur(material.price_per_unit)}/ks`
                : ""}
            </span>
          </div>
        )}

        {/* Total per riadok — obchodník vidí len totál, žiadny material/práca breakdown */}
        <div className="w-28 text-right tabular-nums">
          {calc ? (
            <div className="font-bold">{formatEur(calc.total)}</div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>

        {adminMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Expand admin fields"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Admin row (readonly preview sadzieb — sadzby sú už finálne). */}
      {adminMode && expanded && (
        <div className="px-5 py-3 bg-muted/20 border-t text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field
            label="Sadzba"
            value={
              material.unit === "count"
                ? `${formatEur(material.price_per_unit ?? 0)} / ks`
                : `${formatEur(material.price_per_sqm)} / m²`
            }
          />
          <Field label="Variant" value={material.variant ?? "—"} />
          <Field
            label="Default"
            value={
              material.default_enabled === false
                ? "vypnuté"
                : material.default_enabled === true || !material.optional
                  ? "zapnuté"
                  : "vypnuté"
            }
          />
          <Field
            label="Typ"
            value={material.optional ? "voliteľná" : "povinná"}
          />
        </div>
      )}
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MaterialCatalog — sekciový systém pre "Iba materiál + doprava"
//   1. Hlavný náter (povinný krok)
//   2. Penetrácia (kompatibilná s vybraným hlavným)
//   3. Vrchný lak (voliteľný, kompatibilný)
//   4. Doplnky (samonivel, čistič, posyp, chipsy)
// ──────────────────────────────────────────────────────────────────────
const ROLE_LABELS_SK: Record<string, string> = {
  main: "Hlavný náter",
  primer: "Penetrácia",
  topcoat: "Vrchný lak",
  additive: "Doplnky",
};

function MaterialCatalog({
  floorType,
  materialQtys,
  setMaterialQtys,
}: {
  floorType: FloorType;
  materialQtys: Record<string, string>;
  setMaterialQtys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  // Search — flat global, hľadá v ID + name + desc, case-insensitive substring
  const [searchTerm, setSearchTerm] = React.useState("");

  // Filter produktov pre daný typ podlahy
  const visibleForFloor = React.useMemo(
    () =>
      PRODUCT_CATALOG.filter(
        (p) =>
          !p.floor_types ||
          p.floor_types.length === 0 ||
          p.floor_types.includes(floorType),
      ),
    [floorType],
  );

  // Search results — flat, naprieč všetkými sekciami
  const searchResults = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return null;
    return visibleForFloor.filter((p) => {
      const hay = `${p.name} ${p.id} ${p.desc ?? ""} ${p.brand}`.toLowerCase();
      return hay.includes(q);
    });
  }, [searchTerm, visibleForFloor]);

  const selectedMains = React.useMemo(() => {
    const out = new Set<string>();
    for (const p of visibleForFloor) {
      if (p.role === "main" && (parseFloat(materialQtys[p.id] ?? "") || 0) > 0) {
        out.add(p.id);
      }
    }
    return out;
  }, [visibleForFloor, materialQtys]);

  function isCompatible(p: Product): boolean {
    if (selectedMains.size === 0) return true;
    if (!p.compatible_with || p.compatible_with.length === 0) return true;
    return p.compatible_with.some((id) => selectedMains.has(id));
  }

  // Aké produkty sú vybraté v krokoch
  const hasMain = selectedMains.size > 0;
  const hasPrimer = visibleForFloor.some(
    (p) => p.role === "primer" && (parseFloat(materialQtys[p.id] ?? "") || 0) > 0,
  );

  // Produkty filterované pre každý krok
  const mains = visibleForFloor.filter((p) => p.role === "main");
  const primers = visibleForFloor.filter(
    (p) => p.role === "primer" && isCompatible(p),
  );

  // Krok 3 je iný podľa typu podlahy:
  //   - jednofarebna → vrchný lak (topcoat)
  //   - chipsova     → chipsy (chipy STAVEKON, ako "main" doplnok)
  //   - mramorova    → vrchný lak + kremičitý piesok
  //   - metalicka    → vrchný lak
  //
  // Plus do každého kroku 3 patrí univerzálny tmel na zošívanie prasklín
  // (Sikadur-30) ako voliteľný príplatok.
  const step3Title = floorType === "chipsova" ? "Chipsy + dokončenie" : "Vrchný lak + dokončenie";
  const step3Hint =
    floorType === "chipsova"
      ? "Pridaj chipsy + voliteľný tmel na zošitie prasklín."
      : "Voliteľný ochranný lak + tmel na zošitie prasklín / posyp.";

  const step3Products: Product[] = React.useMemo(() => {
    const out: Product[] = [];
    if (floorType === "chipsova") {
      // Pre chipsovu: chipsy (additive vendored ako role:additive s floor_types=chipsova)
      out.push(
        ...visibleForFloor.filter(
          (p) => p.role === "additive" && p.floor_types?.includes("chipsova"),
        ),
      );
    } else {
      // Pre ostatné: vrchné laky kompatibilné s hlavným náterom
      out.push(
        ...visibleForFloor.filter((p) => p.role === "topcoat" && isCompatible(p)),
      );
      // Pre mramorovu pridaj aj kremičitý piesok
      if (floorType === "mramorova") {
        out.push(
          ...visibleForFloor.filter(
            (p) =>
              p.role === "additive" && p.floor_types?.includes("mramorova"),
          ),
        );
      }
    }
    // Univerzálny tmel na zošitie prasklín — pridaj do každého step 3
    out.push(
      ...visibleForFloor.filter((p) => p.id === "sika-sikadur-30"),
    );
    return out;
  }, [floorType, visibleForFloor, selectedMains]);

  // Doplnky = zvyšok additívov (Level-30, DecoCem, čistič) bez už-použitých
  const step3Ids = new Set(step3Products.map((p) => p.id));
  const additives = visibleForFloor.filter(
    (p) => p.role === "additive" && !step3Ids.has(p.id),
  );

  // Accordion — ktorá sekcia je otvorená.
  // Default: 1 (Hlavný náter). Nezavretne sa automaticky pri pridaní produktu —
  // obchodník môže potrebovať pridať viac kusov hlavného náteru, alebo
  // viac rôznych hlavných náterov naraz. Prepnutie na ďalší step urobí
  // klikom na header sekcie 2/3/4.
  const [openStep, setOpenStep] = React.useState<number>(1);
  // Reset zatvorenia keď user zmení floor type (typy podlahy majú rôzne kroky)
  React.useEffect(() => {
    setOpenStep(1);
  }, [floorType]);

  return (
    <div className="space-y-3">
      {/* Search bar — globálne hľadanie naprieč všetkými sekciami */}
      <div className="rounded-xl border bg-background overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Hľadaj produkt… (napr. 2510, primer, Topstone)`}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/70"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Zrušiť vyhľadávanie"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>
        {searchResults !== null && (
          <div className="max-h-[400px] overflow-y-auto">
            <div className="px-3 py-1.5 bg-muted/40 text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
              {searchResults.length === 0
                ? `Žiadne výsledky pre „${searchTerm}"`
                : `${searchResults.length} ${searchResults.length === 1 ? "produkt" : searchResults.length < 5 ? "produkty" : "produktov"} pre „${searchTerm}"`}
            </div>
            {searchResults.length > 0 && (
              <ul className="divide-y">
                {searchResults.map((p) => (
                  <SearchResultRow
                    key={p.id}
                    product={p}
                    materialQtys={materialQtys}
                    setMaterialQtys={setMaterialQtys}
                    sectionLabel={ROLE_LABELS_SK[p.role] ?? p.role}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Section
        step={1}
        title="Hlavný náter"
        hint="Vyber farebný/finálny náter — od neho sa odvíjajú kompatibilné penetrácie a laky."
        accent="sky"
        products={mains}
        materialQtys={materialQtys}
        setMaterialQtys={setMaterialQtys}
        emptyMsg="Pre tento typ podlahy zatiaľ nie sú v katalógu hlavné nátery."
        open={openStep === 1}
        onToggle={() => setOpenStep(openStep === 1 ? 0 : 1)}
        completed={hasMain}
      />

      <Section
        step={2}
        title="Penetrácia"
        hint={
          selectedMains.size === 0
            ? "Vyber najprv hlavný náter — penetrácie sa filtrujú podľa kompatibility."
            : "Iba penetrácie kompatibilné s vybraným hlavným náterom."
        }
        accent="emerald"
        products={primers}
        materialQtys={materialQtys}
        setMaterialQtys={setMaterialQtys}
        emptyMsg={
          selectedMains.size === 0
            ? "Vyber najprv hlavný náter."
            : "Pre tento systém v katalógu nie je primer."
        }
        open={openStep === 2}
        onToggle={() => setOpenStep(openStep === 2 ? 0 : 2)}
        disabled={!hasMain}
        completed={hasPrimer}
      />

      <Section
        step={3}
        title={step3Title}
        hint={step3Hint}
        accent="amber"
        products={step3Products}
        materialQtys={materialQtys}
        setMaterialQtys={setMaterialQtys}
        emptyMsg="Pre tento systém v katalógu nie sú dokončovacie produkty."
        open={openStep === 3}
        onToggle={() => setOpenStep(openStep === 3 ? 0 : 3)}
        disabled={!hasMain}
      />

      {additives.length > 0 && (
        <Section
          step={4}
          title="Doplnky"
          hint="Stierka, čistič, … — voliteľne k celej zostave."
          accent="zinc"
          products={additives}
          materialQtys={materialQtys}
          setMaterialQtys={setMaterialQtys}
          emptyMsg="—"
          open={openStep === 4}
          onToggle={() => setOpenStep(openStep === 4 ? 0 : 4)}
        />
      )}
    </div>
  );
}

function Section({
  step,
  title,
  hint,
  accent,
  products,
  materialQtys,
  setMaterialQtys,
  emptyMsg,
  disabled,
  open,
  onToggle,
  completed,
}: {
  step: number;
  title: string;
  hint: string;
  accent: "sky" | "emerald" | "amber" | "zinc";
  products: Product[];
  materialQtys: Record<string, string>;
  setMaterialQtys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  emptyMsg: string;
  disabled?: boolean;
  open: boolean;
  onToggle: () => void;
  completed?: boolean;
}) {
  const accentClasses = {
    sky: {
      header: "bg-sky-50 border-sky-200 hover:bg-sky-100",
      badge: "bg-sky-500 text-white",
      title: "text-sky-900",
    },
    emerald: {
      header: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
      badge: "bg-emerald-600 text-white",
      title: "text-emerald-900",
    },
    amber: {
      header: "bg-amber-50 border-amber-200 hover:bg-amber-100",
      badge: "bg-amber-500 text-white",
      title: "text-amber-900",
    },
    zinc: {
      header: "bg-zinc-100 border-zinc-200 hover:bg-zinc-200/70",
      badge: "bg-zinc-700 text-white",
      title: "text-zinc-900",
    },
  }[accent];

  // Súhrn vybraných produktov (collapsed state)
  const selectedSummary = React.useMemo(() => {
    const selected = products.filter(
      (p) => (parseFloat(materialQtys[p.id] ?? "") || 0) > 0,
    );
    if (selected.length === 0) return null;
    return selected
      .map((p) => {
        const qty = parseFloat(materialQtys[p.id] ?? "") || 0;
        const unit = p.sell_by === "package" ? "bal." : "kg";
        return `${p.name} × ${qty} ${unit}`;
      })
      .join(", ");
  }, [products, materialQtys]);

  return (
    <div
      className={cn(
        "rounded-xl border bg-background overflow-hidden transition-opacity",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-2.5 border-b flex items-center gap-3 text-left transition-colors disabled:cursor-not-allowed",
          accentClasses.header,
          !open && "border-b-transparent",
        )}
      >
        <span
          className={cn(
            "inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-extrabold tabular-nums shrink-0",
            completed && !open
              ? "bg-emerald-600 text-white"
              : accentClasses.badge,
          )}
          aria-hidden
        >
          {completed && !open ? "✓" : step}
        </span>
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-extrabold leading-tight", accentClasses.title)}>
            {title}
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug truncate">
            {!open && selectedSummary ? selectedSummary : hint}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <>
          {products.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {emptyMsg}
            </div>
          ) : (
            <ul className="divide-y">
              {products.map((p) => (
                <MaterialRow
                  key={p.id}
                  product={p}
                  materialQtys={materialQtys}
                  setMaterialQtys={setMaterialQtys}
                  disabled={disabled}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function MaterialRow({
  product: p,
  materialQtys,
  setMaterialQtys,
  disabled,
}: {
  product: Product;
  materialQtys: Record<string, string>;
  setMaterialQtys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  disabled?: boolean;
}) {
  const qty = parseFloat(materialQtys[p.id] ?? "") || 0;
  // Cena = null keď nemáme náklad — neukáž odhad, ukáž pomlčku.
  const baseCost =
    p.sell_by === "package" && p.cost_per_package !== null
      ? p.cost_per_package
      : p.sell_by === "kg" && p.cost_per_kg > 0
        ? p.cost_per_kg
        : null;
  const sellRate = baseCost !== null ? applyMargin(baseCost, MARZA_MATERIAL) : null;
  const lineSell = sellRate !== null ? qty * sellRate : null;
  const unit = p.sell_by === "package" ? "bal." : "kg";
  const subtitle =
    p.sell_by === "package"
      ? sellRate !== null
        ? `${p.package_size_kg} kg / balenie · ${formatEur(sellRate)} / bal.`
        : `${p.package_size_kg} kg / balenie · cena ⚠ doplniť`
      : sellRate !== null
        ? `na kg · ${formatEur(sellRate)} / kg`
        : `na kg · cena ⚠ doplniť`;

  return (
    <li
      className={cn(
        "px-4 py-3 flex items-center gap-3",
        qty > 0 && "bg-sky-50/40",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-base inline-flex items-center gap-1.5 leading-snug">
          {p.name}
          {p.note && (
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded">
              {p.note}
            </span>
          )}
        </div>
        {p.desc && (
          <div className="text-[13px] font-semibold text-foreground/80 leading-snug mt-0.5">
            {p.desc}
          </div>
        )}
        <div className="text-[12px] font-bold text-muted-foreground mt-0.5 tabular-nums">
          {subtitle}
        </div>
      </div>
      <div
        className="inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setMaterialQtys((prev) => {
              const cur = parseFloat(prev[p.id] ?? "") || 0;
              const next = Math.max(0, cur - 1);
              return { ...prev, [p.id]: next > 0 ? String(next) : "" };
            });
          }}
          className="w-7 h-7 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none disabled:cursor-not-allowed"
          aria-label="Menej"
        >
          −
        </button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={p.sell_by === "kg" ? 0.5 : 1}
          placeholder="0"
          value={materialQtys[p.id] ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setMaterialQtys((prev) => ({ ...prev, [p.id]: v }));
          }}
          className="h-7 w-14 text-center text-sm font-bold tabular-nums"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setMaterialQtys((prev) => {
              const cur = parseFloat(prev[p.id] ?? "") || 0;
              return { ...prev, [p.id]: String(cur + 1) };
            });
          }}
          className="w-7 h-7 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none disabled:cursor-not-allowed"
          aria-label="Viac"
        >
          +
        </button>
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground ml-1 w-8">
          {unit}
        </span>
      </div>
      <div className="w-24 text-right font-bold tabular-nums text-sm">
        {lineSell !== null && lineSell > 0 ? (
          formatEur(lineSell)
        ) : (
          <span className="text-muted-foreground text-xs font-normal">—</span>
        )}
      </div>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SearchResultRow — flat result row pre material search.
// Ukáže produkt + sekcia (Hlavný náter / Penetrácia / ...) + +/- counter
// rovnaký ako MaterialRow.
// ──────────────────────────────────────────────────────────────────────
function SearchResultRow({
  product: p,
  materialQtys,
  setMaterialQtys,
  sectionLabel,
}: {
  product: Product;
  materialQtys: Record<string, string>;
  setMaterialQtys: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  sectionLabel: string;
}) {
  const qty = parseFloat(materialQtys[p.id] ?? "") || 0;
  const baseCost =
    p.sell_by === "package" && p.cost_per_package !== null
      ? p.cost_per_package
      : p.sell_by === "kg" && p.cost_per_kg > 0
        ? p.cost_per_kg
        : null;
  const sellRate = baseCost !== null ? applyMargin(baseCost, MARZA_MATERIAL) : null;
  const lineSell = sellRate !== null ? qty * sellRate : null;
  const unit = p.sell_by === "package" ? "bal." : "kg";
  const subtitle =
    p.sell_by === "package"
      ? sellRate !== null
        ? `${p.package_size_kg} kg / balenie · ${formatEur(sellRate)} / bal.`
        : `${p.package_size_kg} kg / balenie · cena ⚠ doplniť`
      : sellRate !== null
        ? `na kg · ${formatEur(sellRate)} / kg`
        : `na kg · cena ⚠ doplniť`;

  return (
    <li
      className={cn(
        "px-3 py-2.5 flex items-center gap-3",
        qty > 0 && "bg-sky-50/40",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-sm leading-tight">{p.name}</span>
          <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
            {sectionLabel}
          </span>
          {p.note && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1 py-0.5 rounded">
              {p.note}
            </span>
          )}
        </div>
        {p.desc && (
          <div className="text-[12px] font-semibold text-foreground/75 leading-snug mt-0.5">
            {p.desc}
          </div>
        )}
        <div className="text-[11px] font-bold text-muted-foreground mt-0.5 tabular-nums">
          {subtitle}
        </div>
      </div>
      <div
        className="inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            setMaterialQtys((prev) => {
              const cur = parseFloat(prev[p.id] ?? "") || 0;
              const next = Math.max(0, cur - 1);
              return { ...prev, [p.id]: next > 0 ? String(next) : "" };
            });
          }}
          className="w-7 h-7 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none"
          aria-label="Menej"
        >
          −
        </button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={p.sell_by === "kg" ? 0.5 : 1}
          placeholder="0"
          value={materialQtys[p.id] ?? ""}
          onChange={(e) => {
            setMaterialQtys((prev) => ({ ...prev, [p.id]: e.target.value }));
          }}
          className="h-7 w-14 text-center text-sm font-bold tabular-nums"
        />
        <button
          type="button"
          onClick={() => {
            setMaterialQtys((prev) => {
              const cur = parseFloat(prev[p.id] ?? "") || 0;
              return { ...prev, [p.id]: String(cur + 1) };
            });
          }}
          className="w-7 h-7 rounded-md border bg-background hover:bg-muted/60 text-lg font-bold leading-none"
          aria-label="Viac"
        >
          +
        </button>
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground ml-1 w-8">
          {unit}
        </span>
      </div>
      <div className="w-20 text-right font-bold tabular-nums text-sm">
        {lineSell !== null && lineSell > 0 ? (
          formatEur(lineSell)
        ) : (
          <span className="text-muted-foreground text-xs font-normal">—</span>
        )}
      </div>
    </li>
  );
}
