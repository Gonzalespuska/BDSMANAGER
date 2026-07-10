import { redirect } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  Download,
  GraduationCap,
  Hammer,
  Info,
  PlayCircle,
  Phone,
  ShieldAlert,
} from "lucide-react";

import { getCurrentAppUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { CallScriptsPicker } from "./call-scripts-picker";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /skolenie — Onboarding sekcia pre nováčikov.
 *
 * Nová rola `skolenie` = HR/onboarding rola, ktorú dostane každý nový človek
 * PREDTÝM než dostane reálnu rolu (obchod/obhliadky/realizacie). Uvidí iba
 * tréningové materiály + tímový chat. Neuvidí leady, generátor, atď.
 *
 * Prístupný aj pre všetky ostatné role (materiály sa dajú kedykoľvek
 * zopakovať).
 *
 * TODO (build-out fázy):
 *   • Video player (embed YouTube/Vimeo/Cloudflare Stream)
 *   • PDF viewer + download tracking
 *   • Watched/read status per user + progress bar
 *   • Quiz na konci každej sekcie
 *   • Admin uploadovanie nových video/PDF (Supabase Storage bucket)
 *   • Auto-povýšenie roly z "skolenie" → "obchod" po dokončení všetkých
 *     povinných modulov (admin one-click)
 */
export default async function SkoleniePage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  // Prístup pre všetkých autentifikovaných — Podklady su k dispozícii
  // pre celý tím kedykoľvek. Prv sme mali skolenie rolu ktorá mala
  // exkluzívny prístup, ale to bolo zrušené — Podklady sú knihovna
  // ktorá je otvorená všetkým agentom.

  // Nováčik = agent mladší 90 dní (rovnaká logika ako v AppShell).
  // Vidí varovanie hore že si to má prejsť.
  let isNovacik = false;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const sb = createAdminClient();
    const { data } = await sb
      .from("users")
      .select("created_at")
      .eq("id", user.id)
      .maybeSingle();
    if (data?.created_at) {
      isNovacik =
        Date.now() - new Date(data.created_at as string).getTime() <
        90 * 24 * 3600 * 1000;
    }
  } catch {}

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-sky-500" aria-hidden />
          Podklady
          {isNovacik && (
            <span className="text-[10px] uppercase tracking-wider font-bold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full">
              nováčik
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isNovacik ? (
            <>
              Vitaj v Epoxidovo Manager! Predtým než ti dáme prístup k leadom,
              zákazkám alebo obhliadkam, potrebujeme aby si si prešiel všetky
              podklady nižšie. Admin ťa potom „povýši" na plnohodnotnú rolu.
            </>
          ) : (
            <>
              Tréningové materiály a podklady — nové technológie, tipy pre
              obchod, scenáre obhliadok, bezpečnosť pri realizácii. Aj skúsení
              členovia si to môžu kedykoľvek prelistovať.
            </>
          )}
        </p>
      </header>

      {isNovacik && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-4">
          <div className="inline-flex items-center gap-2 font-bold text-amber-900 text-sm">
            <ShieldAlert className="w-4 h-4" aria-hidden />
            Prečo iba školenie?
          </div>
          <p className="text-xs text-amber-800 mt-1.5 leading-snug">
            Kým sa nezoznámiš s produktmi Epoxidovo (chipsové, mramorové,
            metalické, jednofarebné podlahy) a našimi procesmi, nebudeš mať
            prístup k leadom / generátoru ponúk / obhliadkam / realizáciám.
            Pri každom module klikni na <em>Označiť ako prezreté</em>. Keď sú
            všetky moduly hotové, admin ti nastaví rolu obchod / obhliadky /
            realizácie podľa toho, čo budeš robiť.
          </p>
        </div>
      )}

      {/* 📞 CALL SCRIPTY — interaktívny picker pre obchodákov.
          Priestor + typ podlahy → šitý script s otváracou vetou,
          kvalifikačnými otázkami, argumentami, námietkami s odpoveďami,
          cenovým rozsahom, uzatvárajúcou vetou a tipmi z praxe. */}
      <section className="rounded-3xl border-4 border-sky-300 bg-gradient-to-br from-sky-50/60 via-white to-emerald-50/40 p-5 shadow-md">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-12 h-12 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/30">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black">Call scripty pre obchodákov</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Vyber priestor + typ podlahy a dostaneš presne cielený script.
              Otváracia veta, kvalifikačné otázky, argumenty, námietky
              s odpoveďami, cenový rozsah, uzatvorenie.
            </p>
          </div>
        </div>
        <CallScriptsPicker />
      </section>

      {/* SEKCIE — statické training modules (video + PDF placeholder). */}
      <TrainingSection
        icon={<Phone className="w-5 h-5 text-sky-600" />}
        title="Doplnkové materiály pre OBCHODNÍKOV"
        subtitle="Videá + PDF cheat sheets — pripravujeme"
        tint="sky"
        items={[
          {
            type: "video",
            title: "Rozdiel epoxid vs polyuretán — kedy čo predať",
            duration: "8 min",
            status: "todo",
          },
          {
            type: "video",
            title: "Ako používať generátor cenových ponúk",
            duration: "12 min",
            status: "todo",
          },
          {
            type: "video",
            title: "Prvý telefonát — scenár a najčastejšie námietky",
            duration: "15 min",
            status: "todo",
          },
          {
            type: "pdf",
            title: "Cheat sheet — cenové kategórie + minimálna objednávka",
            pages: 4,
            status: "todo",
          },
          {
            type: "pdf",
            title: "Argumenty proti námietkam (drahé, iná firma, …)",
            pages: 6,
            status: "todo",
          },
        ]}
      />

      <TrainingSection
        icon={<ClipboardList className="w-5 h-5 text-violet-600" />}
        title="Príprava pre OBHLIADKÁROV"
        subtitle="Čo skontrolovať pri obhliadke — merania, dokumentácia, foto"
        tint="violet"
        items={[
          {
            type: "video",
            title: "Scenár obhliadky — čo sa pýtať zákazníka na mieste",
            duration: "10 min",
            status: "todo",
          },
          {
            type: "video",
            title: "Ako správne zmerať plochu + vlhkosť podkladu",
            duration: "18 min",
            status: "todo",
          },
          {
            type: "pdf",
            title: "Obhliadkový checklist — 15 vecí ktoré musíš skontrolovať",
            pages: 3,
            status: "todo",
          },
          {
            type: "pdf",
            title: "Meranie vlhkosti CM metódou — návod krok za krokom",
            pages: 8,
            status: "todo",
          },
        ]}
      />

      <TrainingSection
        icon={<Hammer className="w-5 h-5 text-emerald-600" />}
        title="Príprava pre REALIZÁTOROV"
        subtitle="Bezpečnosť + technológia + dokumentácia z priebehu"
        tint="emerald"
        items={[
          {
            type: "video",
            title: "Bezpečnosť pri práci s epoxidom + PU (OOPP, ventilácia)",
            duration: "20 min",
            status: "todo",
          },
          {
            type: "video",
            title: "Príprava podkladu — brúsenie, penetrácia, opravy prasklín",
            duration: "25 min",
            status: "todo",
          },
          {
            type: "video",
            title: "Nanášanie hlavného náteru — technika + časové okno",
            duration: "18 min",
            status: "todo",
          },
          {
            type: "video",
            title: "Ako fotografovať priebeh realizácie do CRM",
            duration: "6 min",
            status: "todo",
          },
          {
            type: "pdf",
            title: "Technológický postup — kompletná realizácia od A po Z",
            pages: 24,
            status: "todo",
          },
          {
            type: "pdf",
            title: "Karty bezpečnostných údajov (Sika + Topstone materiály)",
            pages: 12,
            status: "todo",
          },
        ]}
      />

      <TrainingSection
        icon={<Info className="w-5 h-5 text-amber-600" />}
        title="Vseobecné podklady o Epoxidovo"
        subtitle="Firma, hodnoty, procesy, kontakty — pre každého v tíme"
        tint="amber"
        items={[
          {
            type: "video",
            title: "Predstavenie firmy Epoxidovo — história, misia, klienti",
            duration: "10 min",
            status: "todo",
          },
          {
            type: "pdf",
            title: "Organizačná štruktúra + kontakty na kolegov",
            pages: 2,
            status: "todo",
          },
          {
            type: "pdf",
            title: "Cenník + platobné podmienky pre zákazníkov",
            pages: 3,
            status: "todo",
          },
          {
            type: "pdf",
            title: "GDPR + interné pravidlá pre prácu s údajmi zákazníkov",
            pages: 5,
            status: "todo",
          },
        ]}
      />

      {/* Footer info */}
      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/30 p-4 text-xs text-rose-900">
        <div className="font-bold mb-1 inline-flex items-center gap-1.5">
          🚧 Vo výstavbe — čo dorobiť
        </div>
        <ul className="list-disc ml-5 space-y-0.5 text-rose-800/90">
          <li>
            Skutočné video embeds (YouTube / Vimeo / Cloudflare Stream) — teraz
            iba placeholder karty
          </li>
          <li>PDF preview + download tracking</li>
          <li>Progress bar per user (koľko % som prešiel)</li>
          <li>Quiz na konci každej sekcie</li>
          <li>Admin upload nových videí + PDF cez Supabase Storage bucket</li>
          <li>
            Auto-povýšenie roly z „skolenie" → obchod/realizacie/obhliadky po
            dokončení
          </li>
        </ul>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

interface TrainingItem {
  type: "video" | "pdf";
  title: string;
  duration?: string;
  pages?: number;
  status: "todo" | "done";
}

function TrainingSection({
  icon,
  title,
  subtitle,
  tint,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tint: "sky" | "violet" | "emerald" | "amber";
  items: TrainingItem[];
}) {
  const headerBg = {
    sky: "bg-sky-50 border-sky-200",
    violet: "bg-violet-50 border-violet-200",
    emerald: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
  }[tint];

  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <section className="rounded-2xl border bg-background overflow-hidden">
      <header
        className={cn("px-4 py-3 border-b flex items-start gap-3", headerBg)}
      >
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="font-extrabold text-sm">{title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="shrink-0 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          {doneCount}/{items.length}
        </div>
      </header>
      <ul className="divide-y">
        {items.map((it, idx) => (
          <li
            key={idx}
            className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
          >
            <div className="shrink-0">
              {it.type === "video" ? (
                <PlayCircle className="w-5 h-5 text-muted-foreground" aria-hidden />
              ) : (
                <BookOpen className="w-5 h-5 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{it.title}</div>
              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2 mt-0.5">
                <span className="uppercase tracking-wider font-bold">
                  {it.type === "video" ? "🎬 video" : "📄 pdf"}
                </span>
                {it.duration && <span>{it.duration}</span>}
                {it.pages && <span>{it.pages} strán</span>}
              </div>
            </div>
            <button
              type="button"
              disabled
              title="Zatiaľ placeholder — čaká na upload obsahu"
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-input bg-background text-xs font-semibold text-muted-foreground disabled:opacity-50 cursor-not-allowed"
            >
              {it.type === "video" ? (
                <>
                  <PlayCircle className="w-3.5 h-3.5" aria-hidden />
                  Pozrieť
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" aria-hidden />
                  Stiahnuť
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
