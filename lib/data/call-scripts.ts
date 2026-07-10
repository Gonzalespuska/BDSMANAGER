/**
 * Call scripty pre obchodníkov — šité na mieru priestor × typ podlahy.
 *
 * Obchodák si na /skolenie (Podklady) vyberie:
 *   1. Priestor: Interiér / Garáž / Priemysel
 *   2. Typ podlahy: Chipsová / Mramorová / Metalická / Jednofarebná /
 *      Antistatická / Univerzálna
 *
 * → dostane presne cielený script pre daný segment.
 *
 * Poznámky:
 * - opening: čo povedať pri zdvihnutí telefónu
 * - qualifying: otázky ktoré musia byť zodpovedané do 2 minút
 * - key_points: 3-5 predajných argumentov (pre náš typ podlahy)
 * - objections: 5-8 najčastejších námietok + gotové odpovede
 * - price_range: čo môžeš citovať bez obhliadky (informatívne)
 * - closing: ako uzavrieť hovor — dohodnúť ďalší krok
 * - tips: what to watch for in tone / signals
 */

export type Priestor = "interier" | "garaz" | "priemysel";
export type TypPodlahy =
  | "chipsova"
  | "mramorova"
  | "metalicka"
  | "jednofarebna"
  | "antistaticka"
  | "univerzalna";

export interface Objection {
  objection: string;
  response: string;
}

export interface CallScript {
  id: string;
  priestor: Priestor;
  typ_podlahy: TypPodlahy;
  title: string;
  subtitle: string;
  opening: string;
  qualifying_questions: string[];
  key_points: string[];
  objections: Objection[];
  price_range: { low: number; high: number; note: string };
  closing: string;
  tips: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// SCRIPTY
// ═══════════════════════════════════════════════════════════════════════

const CHIPS_GARAZ: CallScript = {
  id: "chips-garaz",
  priestor: "garaz",
  typ_podlahy: "chipsova",
  title: "Chipsová podlaha — Garáž",
  subtitle: "Najpredávanejší systém pre garáž (75% zákaziek)",
  opening:
    "Dobrý deň, tu Leo z Epoxidovo. Volám ohľadom Vášho dopytu na epoxidovú podlahu do garáže cez našu stránku. Vidím že Vás zaujíma chipsová podlaha — máte teraz 5 minút alebo Vám môžem zavolať neskôr?",
  qualifying_questions: [
    "Koľko áut plánujete v garáži? (1, 2, alebo 3+)",
    "Rozmery garáže? Presné metre × metre. Ak neviete, odhad m².",
    "Aký je stav podkladu? Nový betón, alebo starý s farbami/olejom?",
    "Kedy plánujete realizáciu? Do mesiaca, do 3 mesiacov, alebo neskôr?",
    "Máte konkrétnu farebnú predstavu? (šedá, béžová, tmavšia, svetlá?)",
    "Adresa realizácie? — mesto minimálne, aby som vedel prácovnú zónu.",
  ],
  key_points: [
    "Chipsová = protišmyk zaručený. Farebné vločky vytvárajú textúru, po ktorej kolesá držia aj keď je mokré (dážď, sneh na aute).",
    "Údržba: iba metla + vysávač. Vyliaty olej sa dá zmyť na jar vodou s Fairy — nezasakne.",
    "Životnosť 15-20 rokov v garáži. Nespochybniteľne odolá pneumatikám, mrazom, chemikáliám.",
    `Dekoratívny efekt — chipsy skryjú drobné nedokonalosti betónu, garáž vyzerá „ako showroom" a nie priemyselne.`,
    "Naša partia to spraví za 2 pracovné dni + 1 deň vytvrdnutie. Auto môžete parkovať po 7 dňoch.",
  ],
  objections: [
    {
      objection: "Je to drahé, čo vlastne dostanem za tie peniaze?",
      response:
        "Za garážovú podlahu 40 m² platíte cca 3 800 €. To je príprava podkladu (diamantové brúsenie), 2 vrstvy odolného epoxidového náteru Sikafloor-264 Plus, protišmykové chipsy full-broadcast, práca 2-3 chlapov 2 dni + doprava. Konkurencia to isté urobí za 2 500 € — ale s tenším náterom čo drží 5 rokov. Naša vydrží 15+. Máte na to záruku 3 roky a Sika materiály sú európska špička.",
    },
    {
      objection: "Chcem si to premyslieť, zavolám vám späť.",
      response:
        "Rozumiem. Aby ste to vedeli pokojne zvážiť — pošlem Vám na email cenovú ponuku so všetkými detailmi, referenčnými fotkami a technickými informáciami. Kedy sa Vám hodí keď Vám opäť zavolám — v pondelok / stredu / piatok popoludní?",
    },
    {
      objection: "Konkurencia má lacnejšiu ponuku.",
      response:
        "Chápem, cena je dôležitá. Môžete mi povedať konkrétne — akú tam majú spotrebu materiálu na m², aký systém (značka epoxidu), aký typ chipsov? Často je to tak, že lacnejšia ponuka je len 1 vrstva epoxidu bez chipsov alebo s podelaným posypom. Ak mi pošlete ich ponuku, porovnám Vám ich riadok po riadku, aby ste vedeli za čo presne platíte.",
    },
    {
      objection: "Betón mám úplne nový, potrebujem to vôbec brúsiť?",
      response:
        `Áno, aj nový betón sa musí prebrúsiť. Na povrchu je cementové mlieko — vrstva ktorá vyzerá pevná ale odlupuje sa. Ak by sme na to nanieli epoxid, o rok Vám odletí. Preto diamantovým brúsením otvárame pórový betón, do ktorého sa epoxid „zakotví". Bez brúsenia nemá záruka zmysel.`,
    },
    {
      objection: "Prečo tak dlho? Iní mi robia za 1 deň.",
      response:
        "Ak Vám niekto ponúka celú garáž za 1 deň, pravdepodobne vynecháva čas vytvrdnutia medzi vrstvami. Epoxid musí schnúť 12-24 hodín medzi vrstvami — inak sa vrstvy nezlepia a podlaha odletí po pol roku. Naše 2 pracovné dni + 1 deň vytvrdnutie = 3 dni total, a to garantuje 15+ ročnú životnosť.",
    },
    {
      objection: "Zavolám na jar keď bude teplejšie.",
      response:
        "Prácujeme celoročne — pod +10°C nemôžeme aplikovať epoxid, ale ak máte v garáži trocha kúrenie (radiátor, tepelný ventilátor) alebo je pripojená k domu, dá sa to spraviť aj v zime. Skôr som mal reklamácie z léta — v horúčavách epoxid moc rýchlo vytvrdzuje. Jeseň a jar sú ideálne. Chcete abych Vám poslal termíny na október?",
    },
  ],
  price_range: {
    low: 92,
    high: 108,
    note:
      "€/m² finálna cena vrátane materiálu, práce, chipsov, DPH. Pri 40 m² garáži = ~4000 €. Pri 20 m² garáži je min. cena 1800 € (fixed setup + doprava).",
  },
  closing:
    "Super. Aby som Vám urobil konečnú ponuku, potrebujeme prísť na miesto — bezplatne, zameriame plochu presne, skontrolujeme podklad testom vlhkosti a odtrhu, a vyfotíme aby náš realizátor vedel čo pripraviť. Kedy sa Vám najlepšie hodí — v priebehu tohto týždňa alebo budúci týždeň? Ideálne poobede 15-17h alebo doobeda 9-11h.",
  tips: [
    "Klient hovorí 'chcem si to premyslieť' → RÝCHLO — 90% takých sa nikdy neozve. Dohodni obhliadku HNEĎ v hovore.",
    "Ak sa spýta na cenu → nikdy nepovedaj presnú sumu bez obhliadky. Povedz range 90-108 €/m² a hneď navrhni obhliadku.",
    "Ak sa spýta ktorý typ epoxidu → 264 Plus. Ak chce viac info, poznaj: Sikafloor-264 Plus, 2-zložkový, Sika Slovakia, priemyselný štandard.",
    "Nikdy nekritizuj konkurenciu menom. Iba porovnaj systém (spotrebu, značku, kroky).",
    "Pri veľkých garážach (60+ m²) môžeš ponúknuť množstevnú zľavu -3 až -5%. Použi ju ako uzatvárací argument.",
  ],
};

const MRAMOR_INTERIER: CallScript = {
  id: "mramor-interier",
  priestor: "interier",
  typ_podlahy: "mramorova",
  title: "Mramorová podlaha — Interiér (byt / dom)",
  subtitle: "Premium segment, high-margin, silná emócia",
  opening:
    "Dobrý deň, tu Leo z Epoxidovo. Volám ohľadom Vášho dopytu na mramorovú podlahu do interiéru. Vidím že Vás zaujíma niečo nadpriemerné — máte teraz chvíľu, alebo Vám môžem zavolať neskôr?",
  qualifying_questions: [
    "Do akej miestnosti? Obývačka, chodba, kúpeľňa, kuchyňa, celý byt?",
    "Rozmery — presné metre × metre, alebo aspoň m² odhad.",
    "Ste v novostavbe alebo rekonštrukcii? Aký je aktuálny podklad?",
    "Aké farby ste si predstavovali? Videli ste už nejaké naše realizácie na webe?",
    "Termín — kedy potrebujete byť hotový? Sťahovanie? Party?",
    "Koľkého domácich / rodiny? (odolnosť voči deťom / psom je rozdiel od single žijúceho)",
  ],
  key_points: [
    `Mramorová podlaha = designer look. Každá je unikát — dva odtiene farieb sa navzájom „prelievajú" ako riečne bystriny. Vaša podlaha nebude ako niekoho iného.`,
    "Bezškárová — na rozdiel od dlažby, glaesu alebo laminátu, mramorová podlaha nemá spoje. Ľahko sa umýva mopom, nekumuluje sa v nej špina.",
    "Antialergická — bez pórov, prachu, vlny. Ideálne pre alergikov alebo malé deti.",
    "Životnosť 25+ rokov. Rezistencia proti vodu, mrazu, chemikáliám. Nezoderie sa ako laminát ani nepopraská ako dlažba.",
    "Podlahové kúrenie kompatibilné. Rovnaký prenos tepla ako dlažba, ale bez chladu naboso.",
    "Naša partia to spraví za 4-5 dní (viac vrstiev + vyzretie). Byt môžete používať po 10 dňoch.",
  ],
  objections: [
    {
      objection: "Je to drahšie ako drevo / laminát.",
      response:
        "Áno, mramorová stojí 155-180 €/m² finálne. Kvalitný dubový parket máte za 90-140 €/m² s montážou. Rozdiel je životnosť: parket máte 12-15 rokov (potom sa musí prebrúsiť alebo vymeniť), mramorovú 25+ bez akejkoľvek údržby. Za 25 rokov ušetríte na výmene parketu — a máte navyše bezškárovú, antialergickú a designer podlahu.",
    },
    {
      objection: "Nebude to studené?",
      response:
        "Nie viac ako dlažba. A ak máte podlahové kúrenie — mramorová podlaha vedie teplo lepšie ako parket, takže teplo z vykurovania cítite priamo. Bez podlahovky je to porovnateľné so studenou dlažbou. Preto ju robíme radi tam kde je vykurovanie v podlahe.",
    },
    {
      objection: "Ako to bude vyzerať za 10 rokov?",
      response:
        "Rovnako. Sme jediní na Slovensku ktorí robíme mramorové so systémom Topstone EP11 — 2-zložkový epoxid s UV stabilizáciou. Nevybledne, nezožltne. Reklamácie za 8 rokov výroby: 0. Máme referencie napr. z hotela Cygla v Bratislave, urobené v 2018 — vyzerá presne rovnako ako v prvý deň.",
    },
    {
      objection: "Chcem najprv vidieť vaše realizácie naživo.",
      response:
        "Perfektné, vôbec ma neuráža. Máme showroom v Ružomberku, alebo môžete sa pozrieť na realizáciu klienta v Bratislave — pošlem Vám dnes emailom mapu 4 najbližších realizácií vo Vašom okolí, kde si to viete ísť pozrieť naživo (klienti sú s tým OK). Pošlem tiež video prehľad všetkých typov farieb — dnes večer to budete mať.",
    },
    {
      objection: "Chcem si to premyslieť s manželom/manželkou.",
      response:
        "Absolútne rozumiem, taká podlaha je rozhodnutie na 25 rokov. Chcete abych Vám poslal foto galériu + cenník + technický popis, aby ste mali čo ukázať? A dohodli by sme si obhliadku o týždeň — je bezplatná, prídeme, zameriame, poradíme s farbami, ukážeme vzorky. Bez záväzku, ale budete mať konkrétnu predstavu.",
    },
    {
      objection: "Nechcem aby mi tu 5 dní pracovali chlapi.",
      response:
        "Chápem. Robievame projekty tak, že prídeme v pondelok ráno, do stredy večer je hotová 1. vrstva, cez týždeň to zreje. V ďalší týždeň prídeme 2 dni na finalne vrstvy. Ak sa dá, robíme počas Vašej dovolenky alebo víkendu — vtedy naozaj nikto neruší. Zosúladíme to s Vaším rozvrhom.",
    },
  ],
  price_range: {
    low: 155,
    high: 180,
    note:
      "€/m² pri byte >30 m². Menšie plochy (chodba, kúpeľňa <10 m²) majú fixný setup, tam počítaj 200-250 €/m². Pri 60 m² byte cca 10 800 €.",
  },
  closing:
    "Skvelo. Aby som Vám urobil finálnu ponuku a poradil s výberom farieb — dohodnime obhliadku. Trvá cca 45 minút, prinesieme vzorník s reálnymi fotkami z realizácií, zameriame priestor a poradíme. Bezplatné, nezáväzné. Ako Vám vyhovuje: sobota dopoludnia alebo utorok/štvrtok 17:00?",
  tips: [
    "Emocionálny segment — počúvaj pocity klienta, nie iba fakty. Ak povie 'chcem aby to bolo krásne', potvrď: 'áno, mramorová je najkrajší efekt aký môžete mať'.",
    "Vzorky sú kľúčové. Vždy sa spýtaj či chce prísť domov s ukázkami. Ak áno → obhliadka je isto. Ak nie → jeho záujem je nízky.",
    "Referenčné foto galéria — pošli klientovi email HNEĎ po hovore. Nechceš že premeškal presvedčenie.",
    "Nikdy nediskutuj cenu pod 150 €/m² — devalvuje to premium pozíciu.",
    "Ak sa klient pýta či to zvládne on sám → povedz že sa to dá spraviť DIY, ale garantovaný výsledok = my. Nediskutuj to viac než potrebné.",
  ],
};

const METALIC_INTERIER: CallScript = {
  id: "metalic-interier",
  priestor: "interier",
  typ_podlahy: "metalicka",
  title: "Metalická podlaha — Interiér (obchodné priestory, showroomy)",
  subtitle: "High-end wow effect, hoteli / autosalóny / showroomy",
  opening:
    "Dobrý deň, tu Leo z Epoxidovo. Videl som Váš dopyt na metalickú podlahu — je to top produkt z našej ponuky, chcete si ho spolu prejsť teraz alebo Vám môžem zavolať neskôr?",
  qualifying_questions: [
    "Kam ide podlaha? Byt (obývačka), showroom, hotel, klientská zóna?",
    "Aké m²? Presne alebo aspoň odhad.",
    "Máte tam podlahové kúrenie?",
    "Aký efekt hľadáte? Zlato-medený (luxus), strieborno-šedý (moderný), čierno-purpurový (dramatický)?",
    "Kedy — termín otvorenia / rekonštrukcie?",
    "Rozpočet — hlavne aby sme sa vôbec zhodli. Metalická je premium segment (200+ €/m²).",
  ],
  key_points: [
    "Metalická = 3D efekt. Priestor akoby mal hĺbku — svetlá sa v ňom lomia ako v tekutom kove. Fotogenický ako obraz.",
    "Používame Topstone EP11 Metalic BA + originálne pigmenty (gun-metal, pearl, black onyx, gold). Každý vzor je namiešaný priamo u Vás — 100% unikát.",
    "Ideálne pod bodové osvetlenie. V showroome, hoteli, autosalóne = wow moment pre zákazníka pri vstupe.",
    "Odolnosť ako u mramorovej — 25+ rokov, bezškárová, chemicky odolná.",
    `Dá sa robiť aj v byte (obývačka), ale primárne komerčné priestory. Klient si musí byť istý že to CHCE, nie „len skúšam".`,
  ],
  objections: [
    {
      objection: "To je pekné, ale je to na tomto Slovensku vôbec reálne?",
      response:
        "Áno, robíme ich 8 rokov. Max Fashion Bratislava showroom (2022), Škoda autosalón Košice (2021), Boutique Hotel Piešťany (2020). Referencie s adresami pošlem emailom, môžete si to ísť pozrieť naživo.",
    },
    {
      objection: "Neviem si to reálne predstaviť, aké to bude v mojom priestore.",
      response:
        "Pri obhliadke prinesieme 4 vzorky rôznych farebných mixov, poobede vidno pri prirodzenom svetle ako Vy budete mať. Aj natočíme video vášho priestoru s podobným svetlom, kde bude ukázané pre-a-po. Behaviorálne — 90% klientov ktorí to raz vidia naživo, sa rozhodnú do 24h.",
    },
    {
      objection: "Neviem či to bude sedieť k môjmu nábytku.",
      response:
        "Metalická podlaha je neutrálna k nábytku — ak máte biely/šedý/čierny nábytok, ide s ňou perfektne. Ak máte teplé drevo, potom vyberieme zlaté / medené pigmenty aby to zladilo. Pri obhliadke Vám farbu vyberáme priamo v priestore.",
    },
    {
      objection: "Ak sa poškrabe alebo zoderie, ako to opraviť?",
      response:
        "Vrchná vrstva Topstone EP22 Plus je 2 mm hrubá — nepoškrabe sa od bežného použitia. Ak by ste raz vypustili ostrý predmet, škrabnutie sa dá vybrúsiť a preleštiť. Ak by ste v horšom prípade poškodili aj metalickú vrstvu, spravíme lokálnu opravu — pigmenty ma zostávajú vo firme, dorábame identický odtieň.",
    },
    {
      objection: "Máte konkrétnu inšpiráciu pre farby?",
      response:
        "Mám 4 najžiadanejšie kombinácie ktoré fungujú v 90% prípadov: 1) White + Gun Metal = moderný luxus, 2) Pearl + Gold = teplý luxus (hotely), 3) Black Onyx + Silver = drama pre autosalóny, 4) Copper + Champagne = butik / módny showroom. Pošlem Vám fotky týchto 4 kombinácií — vyberiete si ktorá sedí k Vášmu priestoru.",
    },
  ],
  price_range: {
    low: 200,
    high: 260,
    note:
      "€/m² finálna cena. Menšie plochy (<20 m²) majú fixný setup, počítaj 300+ €/m². Pri showroome 100 m² = 22 000 €. Pre klienta ktorý sa pýta 'to je vážne 200 €?', okamžite by si mu mal poslať referencie a obhliadku.",
  },
  closing:
    "Chápem že metalická podlaha je rozhodnutie. Najlepšie čo môžeme spraviť — prídeme na miesto s reálnymi vzorkami a natočíme video vášho priestoru s vizualizáciou. Cca 60 minút, bezplatne. Kedy sa Vám hodí najbližšie 3 dni?",
  tips: [
    "Premium segment — nikdy nesmať cenu. Kto to chce, zaplatí. Kto to spochybňuje, mramorovou (155-180 €) mu ponúkni ako alternatívu.",
    "Referenčné fotky sú KRÍTICKÉ — bez nich klient neverí. Vždy pošli EMAIL PO HOVORE s galériou.",
    "Emocionálne posluchať — klient si to už predstavuje. Predávaj emóciu, nie hard-sell.",
    "Ak sa spýta na garanciu → povedz 5 rokov (dvojnásobok chipsová/jednofarebná).",
    "Realizácia trvá 5-7 dní. Klient musí byť flexibilný — dohodnite termín 2 mesiace vopred aby si to naplánoval.",
  ],
};

const JEDNOFAREBNA_GARAZ: CallScript = {
  id: "jednofarebna-garaz",
  priestor: "garaz",
  typ_podlahy: "jednofarebna",
  title: "Jednofarebná podlaha — Garáž (rozpočtové riešenie)",
  subtitle: "Alternatíva k chipsovej — lacnejšia ale rovnako kvalitná",
  opening:
    "Dobrý deň, tu Leo z Epoxidovo. Volám ohľadom Vášho dopytu na epoxidovú podlahu do garáže. Zaujíma Vás jednofarebná alebo si nie ste istý — chcete si prejsť možnosti spolu?",
  qualifying_questions: [
    "Chcete čisto jednofarebnú (bez posypov) alebo je pre Vás dôležitý protišmyk?",
    "Aké m²? 1 auto = ~25, 2 autá = ~40, 3 autá = ~60.",
    "Bude tam olej / benzín / horľaviny? (jednofarebná nie je odolná ako protišmyk)",
    "Farba — šedá (7032), tmavo šedá (7016), béžová, alebo iná RAL?",
    "Termín — kedy chcete začať?",
    "Rozpočet — jednofarebná je 65-85 €/m², chipsová 90-105 €/m². Ktorá kategória vyhovuje?",
  ],
  key_points: [
    "Jednofarebná = najekonomickejšia varianta. Rovnaká Sika farba (264 Plus / 3000), rovnaká príprava podkladu — iba bez chipsov.",
    `Hladký povrch — dobre sa umýva, ideálna do garáže kde chcete videla „vyleštený" vzhľad.`,
    "Životnosť 15+ rokov. Rovnaké materiály ako chipsová (Sikafloor-264 Plus alebo -3000 PU) — iba bez dekoratívnej vrstvy.",
    "Ak chcete PU verziu (polyuretán) — je pružnejšia, UV stabilnejšia (ak máte v garáži okno), a vydrží aj vonkajšie podmienky. Stojí +15%.",
    "2 pracovné dni. Auto po 7 dňoch.",
  ],
  objections: [
    {
      objection: "Prečo je jednofarebná lacnejšia ako chipsová?",
      response:
        "Chipsy (dekoratívne PVC vločky) sa dosypú v poslednej vrstve — pridávajú prácnosť (rozsyp, zbrúsenie zvyšku) a náklady na materiál. Bez nich ušetríte cca 20-25 €/m². Ale strácate protišmyk a dekoratívny efekt.",
    },
    {
      objection: "Vyzerá potom garáž ako industrial? Nie je to fádne?",
      response:
        "Záleží od farby. Šedá 7032 je klasika (nebude fádne, prídavne moderné). Béžová alebo terracotta = teplejšie. Máme 200+ farebných odtieňov — vyberiete si presne to čo pasuje. Aj lesklý vs matný povrch (matný vyzerá elegantnejšie).",
    },
    {
      objection: "Bude šmýkať?",
      response:
        "Trochu, hlavne keď je mokrá. Do garáže kde parkujete jeden-dva krát denne to nie je problém. Ak však máte deti čo tam pobehávajú, prípadne chodíte tam v ponožkách — odporúčam chipsovú alebo pridať antišmykový posyp (piesok v laku) za +5 €/m².",
    },
    {
      objection: "Ako sa čistí olej?",
      response:
        "Bežná mydlová voda + kefa. Sikafloor-264 Plus má chemickú odolnosť voči autoolejom, aku baterkovým chemikáliám. Nevpije sa to.",
    },
    {
      objection: "Chcem tam mať prasklín na okrajoch — pridá sa to?",
      response:
        "Ak máte praskliny > 0,5 mm, pri obhliadke ich vyspravíme Sikadur-31 tmelom. Do 5 prasklín je to zahrnuté v cene, viac ako 5 sa účtuje 20 €/prasklinu.",
    },
  ],
  price_range: {
    low: 65,
    high: 85,
    note:
      "€/m² finálna cena. Epoxid = 65-72 €/m² (264 Plus s lakom). PU polyuretán = 80-90 €/m² (3000 + 3310). Pri 40 m² garáži = 2 600-3 400 €.",
  },
  closing:
    "OK, aby som Vám urobil konečnú ponuku — príde na obhliadku, zameriame plochu a skontrolujeme podklad. 30 minút, bezplatne. Kedy Vám sedí — poobede tento týždeň?",
  tips: [
    "Ak sa pýta na chipsy ale rozpočet neni → posúvaj jednofarebnú s antišmykovým posypom (najlepší kompromis).",
    "Farbu vyberaj konzervatívne (šedá varianty, béžová) — extrémne farby (červená, modrá) sa neskôr klientovi zunujú.",
    "PU varianta (polyuretán) je premium — ponúkni ak má garáž s oknami (UV) alebo je to vnútri prepojené s obývaným priestorom.",
    "Nikdy nekonkuruj s automatickými farbami z Merkury Baumarkt — tie sú cez leto/vlhkom klimate len rok a odletí.",
    "Klient ktorý sa pýta 20+ otázok bez záujmu o obhliadku — pravdepodobne cenový lovec. Nestrácaj čas.",
  ],
};

const PRIEMYSEL_HALA: CallScript = {
  id: "priemysel-hala",
  priestor: "priemysel",
  typ_podlahy: "univerzalna",
  title: "Priemyselná hala — Univerzálny systém",
  subtitle: "Sika MultiDur ES-40 alebo ES-24 ECF (antistatická)",
  opening:
    "Dobrý deň, tu Leo z Epoxidovo. Volám ohľadom Vášho dopytu na priemyselnú podlahu do haly. Aby som Vám vedel poradiť správny systém — mám niekoľko otázok, máte 5 minút?",
  qualifying_questions: [
    "Aký typ prevádzky? (výroba / sklad / servis áut / potravinárstvo / elektronika)",
    "Aké m²? (haly väčšinou 500-5000 m² — pri väčších sa výrazne mení cena)",
    "Aké zaťaženie? (vysokozdvižné vozíky, palety, pieszy chod, medi-elektronika)",
    "Chemikálie / oleje / kyseliny — čo sa tam bude vylievať?",
    "Antistatická podlaha potrebná? (nutná pre elektroniku, výrobu obvodov, farmakol.)",
    "Aké prevádzkové hodiny? Kedy môžeme robiť (víkend, dovolenka, nočná zmena)?",
    "Máte podlahu už teraz (starý betón, dlažba, iný epoxid)? Vieme stav?",
  ],
  key_points: [
    "Priemyselné systémy = úplne iný segment. Pri hale 2000 m² robíme 2-3 týždne s tímom 5-8 chlapov. Ceny 40-90 €/m² podľa systému.",
    "Sika MultiDur ES-40 (huževnatý epoxid 1,5 mm) — pre výrobne haly bez extrémnej chémie. 45-55 €/m².",
    "Sika MultiDur ES-24 ECF (antistatický, vodivý) — pre elektroniku, farmaceutickú výrobu, sklady s explozívnymi materiálmi. 65-80 €/m² + earthing kit.",
    "Sika Pulastic Classic 90/110 (športové haly, telocvične) — pružné 9-11 mm, absorbuje nárazy. 130-160 €/m².",
    "Sika ComfortFloor PS-22/24 (kancelárie s výrobou) — vizuálne pekné, antikórózne. 80-100 €/m².",
    "Naša firma robí priemyslové zákazky na Slovensku od 2018. Referencie: Ústav na výkon trestu Sučany, farmaceutický sklad Chirurg, ...",
  ],
  objections: [
    {
      objection: "Máme aj lacnejšie ponuky od českej / poľskej konkurencie.",
      response:
        "Chápem, pri veľkých zákazkách je cena kľúčová. Naša výhoda: 1) Sme na Slovensku, servis do 24h ak by bola reklamácia. 2) Použijeme materiály Sika Slovensko (nie zahraničné parcelovanie), a záruka je 5 rokov. 3) Pri Vašich m² nás výrazne zaujímame — pôjdeme dole s cenou o 5-10% ak dostaneme konkrétnu porovnávaciu ponuku. Môžete mi poslať konkurenčnú ponuku, spravím Vám riadku po riadku porovnanie.",
    },
    {
      objection: "Nemáme čas na 3 týždňovú realizáciu.",
      response:
        "Rozdelíme halu na etapy — najprv 1/3 (kým iná časť pracuje), potom 2/3. Alebo prácujeme cez víkend a v nočnej zmene. Máme skúsenosti s výrobcami ktorí nemôžu zastaviť produkciu. Pri obhliadke si dohodneme harmonogram vhodný pre Vás.",
    },
    {
      objection: "Aké garancie na to dávate?",
      response:
        "Pri priemyselných zákazkách 5 rokov na materiál a prácu. Nad rámec štandardu — pri Sika MultiDur je 10 ročná záruka od Sika Slovensko (musíme dodržať aplikačný protokol, ktorý dokumentujeme fotoreportážou).",
    },
    {
      objection: "Aký je rozdiel medzi vaším systémom a bežnou betónovou fázou?",
      response:
        "Betón sa časom drobí, olej sa doňho vpije, cementové mlieko sa odlupuje. Naša epoxidová vrstva 1,5-3 mm ju zapečatí — voda a chemikálie neprejdú. Vysokozdvižné vozíky nemajú čo brúsiť. Cena za m² je 3-5× betón, ale za 15 rokov je celkový náklad polovičný (menej opráv, menej výmien pneumatík na kolesách, menej dopravných úrazov).",
    },
    {
      objection: "Musíme robiť tender / verejné obstarávanie.",
      response:
        "Ak ste verejná inštitúcia, viem že postup je iný. Poznám dodávateľské podmienky pre Ministerstvo hospodárstva, Ústav na výkon trestu, atď. Mám aj certifikáty ISO 9001, ISO 14001, BOZP pre všetkých našich chlapov. Pošlem Vám kompletný firemný podklad ktorý potrebujete do súťaže.",
    },
  ],
  price_range: {
    low: 45,
    high: 100,
    note:
      "€/m² podľa systému. ES-40 huževnatá 45-55, ES-24 ECF antistatická 65-80, Pulastic športová 130-160. Pri hale 2000 m² = 90 000-320 000 €. Pri hale 500 m² = 22 000-80 000 €.",
  },
  closing:
    "Vážim si Váš čas. Pre priemyselné zákazky nedávam ponuku bez obhliadky — potrebujeme vidieť halu, zmerať plochu drone-om (pri >1000 m²) a poznať prevádzku. Návrh: prídeme s naším technickým riaditeľom v priebehu týždňa, obhliadka trvá 2 hodiny, bezplatne. Kedy Vám najviac vyhovuje?",
  tips: [
    "Pri priemysli je predajný cyklus dlhší (týždne až mesiace) — nesnaž sa uzavrieť v jednom hovore. Ciel: obhliadka + technický míting.",
    "Vždy sa spýtaj na antistatiku — 30% priemyselných zákaziek to potrebuje (elektronika/farmakológia/výbušniny).",
    "Ak sa firma pýta na certifikáty — pošli ISO 9001, ISO 14001, BOZP + Sika Certified Applicator.",
    "Referencie musia byť konkrétne (názov firmy, m², rok, systém). Bez toho nikto neverí.",
    "Pri >2000 m² zákazkách existujú aj vládne dotácie (EIA pre chemické prevádzky). Nauč sa o nich.",
  ],
};

const CHIPS_INTERIER: CallScript = {
  id: "chips-interier",
  priestor: "interier",
  typ_podlahy: "chipsova",
  title: "Chipsová podlaha — Interiér (obývačka, chodba, kúpeľňa)",
  subtitle: "Odolná + dekoratívna, ideal pre rodinné domy s deťmi",
  opening:
    "Dobrý deň, tu Leo z Epoxidovo. Volám ohľadom Vášho dopytu na chipsovú podlahu do interiéru. Máte teraz chvíľu na prebranie detailov?",
  qualifying_questions: [
    "Do akej miestnosti? Obývačka, chodba, kuchyňa, kúpeľňa, celý byt?",
    "Rozmery — presné metre × metre.",
    "Máte deti / psy / mačky?",
    "Podklad — nový betón, alebo tam už niečo je? (laminát, dlažba, koberec?)",
    "Farebná predstava — svetlá, tmavšia, farebnejšia?",
    "Kedy potrebujete byť hotový?",
  ],
  key_points: [
    "Chipsová do interiéru = odolnosť auta v garáži prenesená do bytu. Neškrabateľné, nešmýka, umývateľné mopom.",
    "Ideálne s deťmi / psami — kolieska od hračiek, kávová šalka, pes s mokrými labami = nič sa nezničí.",
    "Dekoratívny efekt — chipsy dávajú textúru, priestor nevyzerá industrialne ale živo. Vyberáme farebný mix aby ladil k Vášmu nábytku.",
    "Bezškárová, antialergická — bez pórov v ktorých by sa hromadila špina.",
    "Životnosť 15-20 rokov. Pri deťoch ktoré rastú, prežije to celé ich detstvo bez potreby výmeny.",
    "Realizácia 3-4 dni + 24h vytvrdnutie. Vhodné plánovať na dovolenku alebo víkend + 2 pracovné dni.",
  ],
  objections: [
    {
      objection: "Chipsy v byte? Neni to príliš industrial?",
      response:
        "Chipsy sú farebne rôzne — dá sa zvoliť jemný pastelový mix (béžová/šedá/biela) ktorý vyzerá elegantnejšie ako v garáži. Máme aj metalický chips (medený, zlatý) ktorý vyzerá luxusne. Pri obhliadke Vám ukážeme reálne vzorky.",
    },
    {
      objection: "Bude to studené naboso?",
      response:
        "Ak máte podlahové kúrenie — ideál, epoxid vedie teplo dobre. Ak nie máte podlahovku, cca ako dlažba (chladnejšie ako parket). Klienti hlásia že sa na to zvyknú do týždňa. Alternatíva: v spálni môžeme dať koberec cez, v obývačke sa chodí zväčša v papučiach.",
    },
    {
      objection: "Čo keď sa deti postrieľajú s hračkami / farbami / plastelínou?",
      response:
        "Umyje sa. Chipsová podlaha má vrchný ochranný lak — plastelína, temperovky, fixky sa dostanú preč mopom + saponát. Testovali sme aj na farebných perách — po 15 minútach zavädne, iba treba trochu drhnúť. Rodičia sú nadšení.",
    },
    {
      objection: "Ako to spravíte v byte kde bývam? Musím sa vysťahovať?",
      response:
        "Robíme miestnosť po miestnosti. Prvé 2 dni obývačka — Vy medzičasom bývate v spálni. Ďalšie 2 dni chodba/kuchyňa — Vy v obývačke. Prípadne to spravíme cez dovolenku ak Vám vyhovuje. Detaily dohodneme pri obhliadke.",
    },
    {
      objection: "Ako sa opravuje ak sa niečo pokazí?",
      response:
        "Chipsová má výhodu že ak sa lokálne poškodí, dá sa opraviť bez rozdielu (na rozdiel od parkiet kde vidieť čerstvý kus). Prídeme s tou istou farebnou receptúrou, obrúsime miesto a nanesieme nové chipsy — po 1 hodine je to preč. Bežné poškodenia opravujeme v rámci záruky 3 roky.",
    },
  ],
  price_range: {
    low: 95,
    high: 115,
    note:
      "€/m² finálna cena. Menšie priestory (chodba <10 m²) fixed cena od 950 €. Kúpeľňa navyše protišmyk +5 €/m². Pri 60 m² byte cca 6 500 €.",
  },
  closing:
    "Skvelo. Aby som Vám poradil s farbami a urobil finálnu ponuku, dohodnime obhliadku. Prinesieme vzorník s reálnymi ukážkami interiérových chipsov, zameriame miestnosť a poradíme s farbami k nábytku. 45 minút, bezplatne. Kedy Vám vyhovuje?",
  tips: [
    "Bytová chipsová = premium segment (drahšia ako garážová o ~25%). Klient musí byť pripravený minúť.",
    "Ak sa spýta na koberec vs chipsová — koberec 5 rokov, chipsová 15+. Za rovnaký ceny mesačne je chipsová 3× výhodnejšia.",
    "Vždy sa spýtaj na deti / zvieratá — je to zázračná predajná pýchka.",
    "Ukáž emócie — 'chcete aby Vaša podlaha vydržala celé detstvo dieťaťa bez výmeny?'",
    "Ak nechce chipsy ale hľadá bytovú podlahu → posúvaj mramorovú alebo jednofarebnú.",
  ],
};

// Fallback keď nič nezmapované
const GENERIC_INTERIER: CallScript = {
  id: "generic-interier",
  priestor: "interier",
  typ_podlahy: "univerzalna",
  title: "Interiér — Univerzálny script",
  subtitle: "Ak klient ešte nevie ktorý typ chce",
  opening:
    "Dobrý deň, tu Leo z Epoxidovo. Volám ohľadom Vášho dopytu na epoxidovú podlahu. Máte chvíľu, prejdeme si spolu možnosti?",
  qualifying_questions: [
    "Kam chcete podlahu? Byt, dom, obchodný priestor?",
    "Aké m²?",
    "Máte konkrétnu predstavu typu — chipsová (protišmyk), mramorová (designer), metalická (3D efekt), jednofarebná (rozpočtová)?",
    "Máte rozpočet ktorý je pre Vás horná hranica na m²?",
    "Kedy potrebujete byť hotový?",
  ],
  key_points: [
    "Robíme 4 typy podláh: jednofarebná, chipsová, mramorová, metalická. Každá má vlastný efekt a rozsah cien.",
    "Životnosť všetkých našich podláh je 15-25 rokov (podľa typu).",
    "Sika + Topstone materiály — európska špička, garancia 3-5 rokov.",
    "Realizácia 3-7 dní podľa typu a plochy.",
    "Bezplatná obhliadka a cenová ponuka.",
  ],
  objections: [
    {
      objection: "Neviem ktorý typ potrebujem.",
      response:
        "Presne preto tu som — pri obhliadke Vám prinesieme vzorky všetkých 4 typov, zmeriame plochu a odporučíme čo najviac sedí k Vášmu priestoru a rozpočtu. Nezáväzne, bezplatne.",
    },
  ],
  price_range: {
    low: 65,
    high: 250,
    note:
      "Široký rozsah podľa typu. Jednofarebná od 65, chipsová 95-115, mramorová 155-180, metalická 200-260 €/m².",
  },
  closing:
    "Chápem že je ťažké rozhodnúť sa pri toľkých možnostiach. Najlepšie čo môžeme spraviť — príde s Vzorkovnkom, ukážeme naživo 4 typy podláh. 45 minút, bezplatne. Kedy Vám sedí?",
  tips: [
    "Ak klient nevie ktorý typ chce — nie je to zlé, jeho záujem je vážny. Ponúkni obhliadku RÝCHLO.",
    "Zisti rozpočet ako prvé — potom vieš ktorý typ mu ukázať.",
    "Nikdy nepresadzuj najdrahšiu variantu — klient si spomenie a bude nedôveryhodný.",
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════

export const CALL_SCRIPTS: CallScript[] = [
  CHIPS_GARAZ,
  CHIPS_INTERIER,
  MRAMOR_INTERIER,
  METALIC_INTERIER,
  JEDNOFAREBNA_GARAZ,
  PRIEMYSEL_HALA,
  GENERIC_INTERIER,
];

/**
 * Vráti prvý matchujúci script pre priestor + typ podlahy.
 * Ak konkrétny nevie nájsť, vráti prvý pre priestor. Ak ani to nie,
 * generic interiér.
 */
export function findScript(
  priestor: Priestor,
  typ: TypPodlahy,
): CallScript {
  // 1) presný match
  const exact = CALL_SCRIPTS.find(
    (s) => s.priestor === priestor && s.typ_podlahy === typ,
  );
  if (exact) return exact;
  // 2) univerzálny pre priestor
  const uni = CALL_SCRIPTS.find(
    (s) => s.priestor === priestor && s.typ_podlahy === "univerzalna",
  );
  if (uni) return uni;
  // 3) prvý pre priestor
  const anyForPriestor = CALL_SCRIPTS.find((s) => s.priestor === priestor);
  if (anyForPriestor) return anyForPriestor;
  // 4) fallback
  return GENERIC_INTERIER;
}

export const PRIESTOR_LABELS: Record<Priestor, string> = {
  interier: "🏠 Interiér (byt/dom)",
  garaz: "🚗 Garáž",
  priemysel: "🏭 Priemysel (hala/showroom)",
};

export const TYP_LABELS: Record<TypPodlahy, string> = {
  chipsova: "🎨 Chipsová",
  mramorova: "💎 Mramorová",
  metalicka: "✨ Metalická",
  jednofarebna: "🟦 Jednofarebná",
  antistaticka: "⚡ Antistatická ESD",
  univerzalna: "🎯 Neviem / poradte",
};
