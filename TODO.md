# Epoxidovo Manager — Running TODO

Otvorené úlohy a plánované features. Aktualizuje sa priebežne.

---

## 📱 AUTO-SMS pri „Nezdvíhal" (fáza 2)

Keď obchodák stlačí **Nezdvíhal** na leade (alebo cez status picker →
„Nezdvíhali"), status sa zmení na `no_answer`. **Paralelne pošleme SMS
klientovi z čísla obchodáka.**

**Detaily:**
- Šablóna SMS: *„Dobrý deň, volal som Vám ohľadom cenovej ponuky epoxidových
  podláh (Epoxidovo). Zavolajte prosím späť keď budete voľní. Ďakujem,
  {agent.name} · {agent.phone}"*
- Odosielateľ = **agent.phone** z users tabuľky (nie firemné číslo)
- Log do novej tabuľky `lead_sms_log` (timestamp, delivered/failed, cost)
- Rate limit: max 1 SMS na lead za 24h
- Feature flag `app_settings.sms_auto_missed_call` — možnosť vypnúť
- Poskytovateľ: Twilio Programmable Messaging alebo O2 SK API (výber)
- Caller ID verify pri poskytovateľovi aby SMS reálne prišla z čísla obchodáka

**Kde v kóde:** `app/api/lead/action/route.ts` — action=`missed_call` branch
(tam je aj podrobný TODO komentár priamo v kóde). Aktuálne iba
`lead_activities` insert; SMS neposielame.

---

## 🚨 ČAKÁ NA UŽÍVATEĽA (manuálne akcie)

### Supabase SQL migrations — treba spustiť v SQL Editore

- [ ] **`supabase/10_role_handoff.sql`** — pridá statusy `needs_inspection`,
      `in_realization` + realization_media tabuľka + storage bucket.
      Bez toho nefunguje handoff obchod→obhliadky→realizácie.
- [ ] **`supabase/11_office_reminders.sql`** — nová tabuľka `office_reminders`
      pre kalendárové pripomienky v /office sekcii. Bez toho `/api/office/reminder`
      vracia „relation does not exist".

### GitHub push

- [ ] **Commit-y sú lokálne ale ne-pushnuté** — v repo je 85+ commit-ov
      pred origin/main. Remote `github.com/Gonzalespuska/BDSMANAGERR.git` vracia
      404, alternatíva `bdsmanager.git` odmieta credentials (v keychainu je token
      pre `Veelynsk` účet, nie `Gonzalespuska`). Deploy naďalej funguje priamo
      cez `wrangler pages deploy` (aktuálne skript v package.json `pages:deploy`).
      Ale zdrojová história je iba lokálne. **Treba manuálne pushnúť** cez
      GitHub Desktop alebo správne credentials.

### Externé integrácie

- [ ] **Deploy `epoxidovo.sk`** s Prisma migration pre `termin` field
      (v `/Users/puska/epoxidovo`)
- [ ] **V Zapieri** pridať mapping FB Lead Form „when" → CRM `data.termin`.
      **DÔLEŽITÉ — Meta Lead Form musí mať IDENTICKÝ zoznam ako web:**
      - Čo najskôr
      - Do 1 mesiaca
      - Do 3 mesiacov
      - Do 6 mesiacov
      - Zatiaľ len zisťujem informácie

      (Rovnaké texty. CRM ich rovnako spracuje bez ohľadu na zdroj.
      Ak sa odchýlia od tohto zoznamu, TERMIN_LABELS v
      `app/api/cron/sync-epoxidovo/route.ts` treba rozšíriť.)

---

## 🚧 Naplánované integrácie

- [ ] **Google Ads Leadgen** — leady z Google Ads Lead Form Extensions.
      Pri aktivácii kampane pripojíme cez Zapier (podobne ako Meta),
      alebo cez Google Ads Data Transfer API. Zatiaľ 0 leadov,
      Analytika ich zobrazuje ako "plánované".
      *Kroky pri aktivácii:*
      1. Vytvoriť Google Ads lead form v kampani
      2. Zapier: Google Ads → Webhooks POST na `/api/webhook/lead/{source_id}`
      3. Vytvoriť LeadSource row s `type=google` v DB

---

## 🔴 Priorita 1 — obchodníci ju kričia

- [ ] **OBCHODÁK VIDÍ TOTAL OBSADENOSŤ TÍMU (pri návrhu termínu) (KĽÚČOVÉ)**

      Obchodák pri telefonáte so zákazníkom potrebuje POVEDAŤ termín. Aby
      sa netrafil na vybookovaného obhliadkara/realizatora, musí vidieť
      **TOTAL obsadenosť tímu — od všetkých obchodákov** (nie len svoje).

      **Čo obchodák uvidí:**
      1. **Kalendár tímu (read-only prehľad)**
         - Každý deň má „obsadenosť" — koľko obhliadok / realizácií je
           priradených celkom (od všetkých obchodákov spolu)
         - Napr. streda = "🔍 4 obhliadky · 🔨 2 realizácie" → vie že
           obhliadkari sú zaneprázdnení, dá termín na štvrtok
      2. **Filter podľa smeru** — obchodák si zvolí:
         - **Východ** (Košice, Prešov, Michalovce, Spiš, ...)
         - **Západ** (Bratislava, Trnava, Nitra, ...)
         - **Sever** (Žilina, Martin, Poprad, Trstená, ...)
         - **Juh** (Nové Zámky, Komárno, Levice, ...)
         - Alebo konkrétne mesto (autocomplete: "Košice")
      3. **Smart-scheduling návrh:**
         - Ak obchodák napíše „Košice", systém povie:
           **„Peto Obhliadkár tam ide už v stredu 24.7. na Michal.
           Prídavok obhliadky = +30 min. Navrhni tento termín."**
         - Ušetrí sa dopravný čas + náklady

      **Ako to postaviť:**
      - `SELECT date, city, direction, count(*) FROM inspections
        GROUP BY date, direction` — agregát obsadenosti per smer
      - Geografia miest — už máme lib/data/transport.ts (km od HQ) →
        rozšíriť o `direction` (east/west/north/south) podľa lat/lon
      - UI: nový tab „Obsadenosť tímu" vedľa kalendára + heatmapa +
        filter chip-y (Východ/Západ/Sever/Juh)
      - Smart návrh — pri klik na deň v modáli „Priradiť obhliadku"
        systém overí ktorý obhliadkár už ide do daného mesta
        a odporučí ho

- [ ] **POZNÁMKY & ÚLOHY so scheduled notifikáciami**

      Nová sekcia `/poznamky` (nav tab pre všetky role) — kostra už deployová.
      Funkčný obsah treba dorobiť:

      **1. DB migrácia:**
      ```sql
      CREATE TABLE user_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id uuid REFERENCES users(id) ON DELETE CASCADE,  -- komu patrí (kto ju vidí)
        assigned_by uuid REFERENCES users(id),                 -- kto ju vytvoril (pre task from someone)
        body text NOT NULL,
        remind_at timestamptz,       -- čas notifikácie (NULL = bez pripomienky)
        completed_at timestamptz,    -- klik "Hotovo"
        tags text[],                 -- ['urgent', 'sledovať', 'dohodnuté', ...]
        created_at timestamptz DEFAULT now()
      );
      ```

      **2. UI:**
      - `/poznamky` — list poznámok + inline add (text + čas)
      - Filter: dnes / týždeň / všetky / dokončené
      - Klik na poznámku → detail modal (edit body/čas/priradenie)
      - **"Nová úloha pre kolegu"** button — dropdown users + čas + text
      - Poznámky sa zobrazujú aj v `/notifikacie` sekcii ako todo pool
      - Poznámky s časom vidno aj v kalendári (calendar_notes s kind='note')

      **3. Notifikačný trigger:**
      - Cron worker (raz za minútu) prehľadá `user_notes WHERE remind_at
        <= now() AND completed_at IS NULL` → pošle notif každému ownerovi
      - Zvonček + Web Push (keď aktivujeme SW)

      **4. UX poznámka od používateľa:**
      *"nech je to aj ako button ked si chces nieco zapisat vedla tim chat
      ale bude to sluzit aj ako ulohy proste ze zadam tym ulohu napr danemu
      obchodakovi aby urobil nieco o tomto case alebo teda ze v tom case
      mu pride notifikacia 12:30 mu nastavim noti s poznamkou: Vynes smeti"*

- [ ] **KALENDÁR — MANUÁLNE PRIRADENIE OBHLIADKY / REALIZÁCIE**

      Tlačidlá „Nová obhliadka" (fialové) a „Nová realizácia" (emerald) sú
      už v hlavičke kalendára (viditeľné pre `obchod` + `admin`). Zatiaľ
      navigujú na `?assign=<kind>&manual=1`, ale samotný modal ešte treba
      dorobiť:

      1. **Query param handler** — `?assign=inspection&manual=1` (bez `lead`)
         otvorí modal „Nová obhliadka":
         - Lead picker (autocomplete zo všetkých obchodovaných leadov —
           obchodák vidí svoje, admin všetky)
         - Alebo možnosť „bez leadu" (voľná návšteva, cenový prieskum)
         - Dátum + čas (klik na deň v kalendári preselectuje dátum)
         - Poznámka
         - Osoba (auto-preselect podľa home_city zákazky, dá sa prepnúť)
         - Potvrdiť
      2. **Klik na deň v kalendári** — otvorí to isto modal, ale s pre-
         vyplneným dátumom
      3. **Rovnaké pre realizáciu** — plus multi-day option (dátum od / do)

- [ ] **REALIZATOR TÍMY + MULTI-DAY SCHEDULING (KĽÚČOVÉ)**

      **1. Realizator = jednotlivec + patrí do TÍMU**
      - Pri vytváraní usera s rolou `realizacie` admin zadá aj `team_name`
        (napr. „Tím A", „Tím B", „Tím Peťo & Ivan")
      - Tíme môžu byť 1-3 členovia
      - Obchodák priraďuje realizáciu **TÍMU**, nie jednotlivcovi — netreba
        manuálne tagovať 2 ľudí
      - DB: `users.team_id` UUID → `teams` tabuľka (id, name, notes)

      **2. Smart-suggest BAR — Obhliadka (v Prehľade)**
      - Vstup: mesto zákazníka (autocomplete zo Slovenska)
      - Systém query-uje priradené obhliadky (assignments) na najbližšie
        2-4 týždne, zoradí ich per deň + geo-agreguje podľa smeru/mesta
      - Logika návrhu:
        1. **Deň s obhliadkou v tom istom meste** = TOP odporúčanie („Peťo
           tam už ide streda 24.7. — pridavok 20 min")
        2. **Deň s obhliadkou v okolí (< 40 km)** = 2. odporúčanie
        3. **Deň s obhliadkou v tom istom smere** (východ / západ) =
           3. odporúčanie
        4. Ak žiadny z uvedených → najbližší voľný deň bez už-planovanej
           obhliadky
      - UI: chip s dátumom + confidence badge („🟢 Top", „🟡 OK", „🔴 Fresh")
      - Klik na návrh → otvorí modal „Priradiť obhliadku"

      **3. Smart-suggest BAR — Realizácia**
      - Vstup: mesto + m² + typ podlahy (voliteľné)
      - Logika kombinácie zákaziek:
        • m² <= 25 (garáž, malá miestnosť) → **do 5 zákaziek za deň jedným tímom**
        • m² 26-60 → 1-2 zákazky za deň
        • m² 61-100 → 1 zákazka = solo deň, možno pridať malú 2. cez ráno/poobedie
        • m² 100+ → **jednodňový solo** alebo **multi-day** (halli 300-1000 m² sú 3-5 dní)
      - Multi-team distribúcia — ak sú v ten deň všetky tímy A/B/C voľné,
        ponúkni „Tím A dnes hotový v poobedie, Tím B ideálne pre novú zákazku"
      - Konfliktné termíny — zvýrazniť dni kedy sú všetky tímy vybookované

      **4. Priradenie realizácie — modal**
      - **PREVIEW kalendára** v modáli — obchodák počas zadávania vidí
        farebnú obsadenosť tímu (voľno / obhliadka / iná realizácia)
      - **Dátum od** (povinný) + **dátum do** (voliteľný — ak jeden deň,
        klikne na label „Iba jeden deň" → druhé pole sa disable-uje/vyčistí)
      - Alternatívny UI wireframe:
        ```
        📅 Dátum od:  [17. 7. 2026]
        📅 Dátum do:  [__________]   ← disabled ak checkbox zapnutý
        [☑] Iba jeden deň
        ```
      - **Tím** — dropdown (Tím A / Tím B / ...) alebo „Auto — najlepší
        podľa dostupnosti"
      - **Časové rozmedzie**, NIE konkrétny čas — realizácia trvá celý
        deň, presný nástup si dohodne tím so zákazníkom cez chat-room
      - **Poznámka** — „daj si pozor na prasklý podklad", „prístup zo dvora"

      **5. Nová tabuľka `realization_assignments`:**
      ```sql
      CREATE TABLE realization_assignments (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id        uuid REFERENCES leads(id) ON DELETE CASCADE,
        team_id        uuid REFERENCES teams(id) ON DELETE SET NULL,
        scheduled_from date NOT NULL,
        scheduled_to   date,  -- NULL = jeden deň
        note           text,
        created_by     uuid REFERENCES users(id),  -- ktorý obchodák priradil
        status         text CHECK (status IN ('scheduled','in_progress','done','cancelled')),
        created_at     timestamptz DEFAULT now(),
        updated_at     timestamptz DEFAULT now()
      );
      ```

      **6. UI komponent — `PrehladSmartSuggest`**
      Už kostra existuje v `app/calendar/prehlad-smart-suggest.tsx`.
      Zatiaľ placeholder deterministic návrh z hash mesta. Real logika
      príde po:
      - SQL migrácia `teams` + `realization_assignments`
      - GeoDB pre mestá SR (lat/lon, direction)
      - Cron worker prepočíta odporúčania every 5 min

- [ ] **NAFOTENIE MATERIÁLU / PRODUKTU — sprievodca podľa vzoru (poistka-style)**

      Podobne ako pri obhliadke, aj tu chceme **wizard-style visual guide**:
      niekto dostane úlohu nafotiť materiál / hotovú realizáciu / vzorník
      a aplikácia ho krok za krokom vedie čo natočiť z akého uhla.

      Model: poistka appka pri fotke nehody
      *("teraz nafoť čelný pohľad zľava — zarovnaj podľa siluety",
        "teraz VIN kód — priblíž na 30 cm", ...)*

      **Ako to funguje:**
      1. **Obchodák / admin zadá úlohu**: „Nafoť materiál — Sikafloor-264 Plus, 20 kg balenie"
         cez `/poznamky` alebo pri realizácii cez chat priamo realizatorovi.
      2. **Príjemca dostane notif** → klik → otvorí sa full-screen wizard:
         - Krok 1/N: **Ukážkové foto** (referenčný obrázok z galérie) + text
           „Nafoť balenie zpredu — zarovnaj podľa mriežky, nech je etiketa
           čitateľná"
         - **Prekryv (overlay) na kamere** — silueta / mriežka aby si používateľ
           zarovnal záber podľa vzoru
         - **Klik Nafoť** → ide na ďalší krok
         - Krok 2/N: „Nafoť etiketu detailne (30 cm)" — ďalšie referenčné foto
         - ...
      3. **Po dokončení** — všetky foto sa upload-nú do jedného balíčka
         (napr. Supabase Storage `material-shoots/<task_id>/*.jpg`) +
         zoznam s popiskami.
      4. **Obchodák dostane notif** že materiál je nafotenný, otvorí galériu.

      **Šablóny wizard-ov (guide templates):**
      - Materiál — balenie (5 fotiek: front / bok / etiketa / QR / detail obsahu)
      - Realizácia hotová (10 fotiek: celok / detail / rohy / prah / brand)
      - Vzorník podlahy pre marketing (3 fotky: čistý / detail chipsov / lesk)
      - Poškodenie na aute pri doprave (poistka-style, 8 fotiek)

      Šablóny sú v DB (`photo_guide_templates` tabuľka) — admin ich upravuje
      podobne ako info kanál. Každý krok má:
      `{ ref_image_url, instruction_text, overlay_svg?, min_photos_required }`.

      **UI použije MediaDevices API** — `getUserMedia({video})` na kameru,
      canvas overlay na guide. Fallback pre desktop = plain file input.

- [ ] **OBHLIADKÁR — nástroj na zápis výsledkov obhliadky (poistka-style)**

      Obhliadkár po príchode na miesto potrebuje **nástroj vo forme
      formulára + foto uploadu**, podobne ako pri poistných udalostiach:
      systematický zápis meraní + dokumentácia foto.

      **Formulárové polia:**
      1. **Odtrhový test** (adhesion test / pull-off) — číselná hodnota
         v MPa alebo N/mm² (napr. 1.8 MPa) + zhodnotenie (✅ vyhovuje /
         ⚠️ hraničné / ❌ nevyhovuje). Prah: >1.5 MPa OK.
      2. **Vlhkomer** — merania na 3–5 miestach v % (napr. CM metóda alebo
         elektronický vlhkomer) — priemer + max hodnota
      3. **Teplota + relatívna vlhkosť vzduchu** — pre kalkuláciu pot life
         epoxidu (kritický parameter)
      4. **Rozmery** — presné m² z merania (potvrdenie/korekcia CP hodnôt)
      5. **Stav podkladu** — dropdown: ✅ v poriadku / ⚠️ škody
         (výtluky, praskliny, mastnota) / ❌ nutná príprava (frézovanie,
         penetrácia)
      6. **Prístupnosť** — pre transport materiálu (schody, výťah, dvor,
         parkovanie) + kritickosť pre logistiku
      7. **Poznámka** — voľný text pre špecifiká
      8. **Zákazníkov termín** — potvrdenie / úprava priorít

      **Foto upload:**
      - Podľa potreby — obhliadkár klikne "+ Foto" a nahrá tú ktorú
        aktuálne potrebuje (praskliny, poškodenia, celok, prístup, testy)
      - Každé foto má voľnú popisku ("praskliny v strede", "vlhkosť SV
        roh", "odtrhový test 1.8 MPa")
      - Storage bucket: `inspection-media/{lead_id}/{uuid}.jpg`

      **Po odovzdaní formulára:**
      - Automatický prepočet: **je zákazka realizovateľná?**
        (odtrhový test + vlhkosť + stav podkladu → červené flags)
      - Aktualizácia lead statusu → `inspected` s výsledkami
        v `data.inspection_result`
      - Notifikácia obchodákovi ("Obhliadka Boris Henc dokončená —
        odtrhový test 1.8 MPa OK, vlhkosť 3.2%. Zákazka realizovateľná.")
      - Obchodák si otvorí result → doladí CP podľa reálnych m² +
        pridá odplatu za prípravu podkladu (ak treba)

      **DB migration** — nová tabuľka `inspection_reports`:
      ```
      inspection_reports(
        id uuid,
        lead_id uuid ref leads,
        inspector_id uuid ref users,
        adhesion_mpa numeric,
        moisture_pct numeric,
        moisture_max_pct numeric,
        air_temperature numeric,
        air_humidity_pct numeric,
        measured_m2 numeric,
        substrate_condition text,
        access_note text,
        feasible boolean,
        agent_note text,
        created_at timestamptz
      )
      ```
      Foto ostávajú v existujúcom Supabase Storage bucket
      `inspection-media` (už definované v `10_role_handoff.sql`).

- [ ] **KOMPLETNÝ CROSS-ROLE FLOW: obchodák → obhliadkár → realizator (KĽÚČOVÉ)**

      Toto je celý spôsob, akým obchodák predáva prácu ďalším rolám:

      **1. Obchodák pridelí obhliadku (cez kalendár):**
      - Klikne na deň v kalendári → modal:
        • Zvolí lead (autocomplete zo svojich)
        • Zvolí konkrétneho obhliadkara (dropdown users s rolou obhliadky)
        • Zvolí čas obhliadky
        • **Voľná poznámka** — "daj si pozor na starý podklad", "prístup zo dvora"
      - Uloží sa: `leads.status='needs_inspection'` + `inspection_by`, `inspection_at`
      - Aj v `calendar_notes` sa vytvorí záznam s `kind='meeting'`, `contact_name=<obhliadkar>`

      **2. Obhliadkar to VIDÍ dvomi cestami:**
      - **Nová sekcia „Obhliadky"** (miesto Leady) — zoznam kartičiek podobne
        ako leady u obchodáka; každá karta má meno klienta, adresa, čas,
        poznámka od obchodáka. Klik → detail obhliadky
      - **V svojom kalendári** — každý deň s obhliadkou má chip s menom leadu
      - **🔔 Notifikácia na zvončeku** — "Nová obhliadka od Elo: Boris Henc, streda 10:00"

      **3. Auto-prechod stavu (cron):**
      - Cron worker (raz za 10 min) prehľadá leady so `status='needs_inspection'`
        a `inspection_at < now()` → prehodí na `status='inspected'`
      - Lead ostane v tomto stave až kým obhliadkár nezapíše výsledok
        (rozmery, foto) a manuálne neposunie ďalej (interested/lost)
        alebo obchodák neposunie na `in_realization`

      **4. Rovnaký princíp pre realizátora:**
      - Obchodák → priradí realizáciu → status `in_realization` +
        `realization_by`, `realization_at`
      - Realizátor to má vo svojej sekcii „Realizácie" + kalendári

      **5. Kalendár obhliadkara/realizatora:**
      - Vidí ROVNAKÝ kalendár prepojený s obchodákom — jeho priradenia
        + osobné notes; nič cudzie z iných obhliadkarov (filter per assigned_to)

      **6. Chat per úloha:**
      - Klik na obhliadku → tlačidlo „Spustiť chat" → chat-room s obchodákom
        (o tejto konkrétnej obhliadke). "Nemôžem prísť skôr, môžeme posunúť?"

      **7. Archív:**
      - Dokončené obhliadky/realizácie idú do archívu na 30 dní
      - Cron worker premaže po 30 dňoch

      DB migration:
      ```
      -- leads.status CHECK constraint: pridať 'inspected'
      -- Cron job na auto-transition inspected: v cron-worker/src/index.ts
      -- Notification generator: pri needs_inspection insert vytvor
      --   notification pre inspection_by usera
      ```

- [ ] **Kalendár — cross-role scheduling (starší popis, presunúť do vyššieho)**
      *"tento kalendar bude prepojeni obchodak tam bude zadavat robotu
      realizatotrom a obhliadkarom"*
      - Obchodák klikne na deň v kalendári → modal:
        • Zvolí typ akcie: 🔍 Obhliadka / 🔨 Realizácia / 📞 Vlastný callback
        • Zvolí lead (autocomplete zo svojich leadov)
        • Zvolí presný čas
        • Priradí konkrétneho obhliadkara / realizatora (dropdown users)
        • Voliteľná poznámka
      - Uloží sa do handoff tabuliek (`inspection_by/at`, `realization_by/at`)
        + aktualizuje `leads.status` na `needs_inspection` / `in_realization`
      - Obhliadkar / realizator uvidí svoju robotu na svojom kalendári
        (vlastný filter podľa role — už funguje na page.tsx level)
      - Notifikácia priradenej role (Web Push / Slack / email — TODO neskôr)
      - Admin vidí všetky priradenia (globálny view)



- [ ] **Info kanál (rola 'info')** — kombinovateľná rola k obchod/obhliadky/realizacie.
      Odomkne tab 'Info' v navigácii s videami a PDF podkladmi:
      - Obchod: rozdiel epoxid vs polyuretán, ako použiť generátor, argumenty proti námietkam
      - Obhliadkár: scenár čo sa pýtať, ako správne merať
      - Realizátor: bezpečnosť, technológia, ako fotografovať
      DB: `users.roles: text[]` namiesto `role: text` (migration).

- [ ] **Inventúra / sklad** — admin tabuľka materiálu (Bostik XT4, chipsy, laky…).
      Realizator pri zákazke označí "mám pripravené veci" → odpočíta zo skladu.
      Audit log s timestamps kto kedy čo bral.

- [ ] **Push notifikácie na mobil** — PWA manifest už existuje, treba
      Service Worker + Web Push Subscription + endpoint na uloženie
      subscriptions + trigger pri novom leade / callbacku / pripomienke.

- [ ] **Office pripomienky — server-side push v Xh** — momentálne banner
      sa zobrazí až keď user otvorí /office (client polling). Neprihlásený
      user notif nedostane. Riešenie: cron worker + Web Push API + preferences
      (o koľkej pripomenúť).

- [ ] **Office pripomienky — kategórie + recurring + centrálny prehľad**
      (rozšírenie existujúceho reminders):
      - Kategórie s farebnými štítkami:
        • 🌐 **Domény** — expirácie (epoxidovo.sk, najcrm.sk, iné)
        • 🚗 **STK / EK / diaľničná známka** — dátumy pre firemné autá
        • 💰 **Pravidelné platby** — nájom, leasing, poistky, cloud služby
          (Cloudflare, Supabase, Resend, GitHub, Meta, Google Ads)
        • 📋 **Iné** — voľné poznámky
      - **Recurring pripomienky** (raz mesačne, ročne, každý 15. deň v mesiaci)
        — po dismissu sa automaticky vytvorí ďalšia pre nasledujúce obdobie
      - **Zmeškané svietia na červeno** (už funguje — 🔴 Zmeškané sekcia)
      - **Nepustí odklikanie iba náhodne — vyžadovať potvrdzujúci click**
        (napr. „Áno, doména epoxidovo.sk je predĺžená do 2027-06-01")
      - **Bulk import** — CSV s typmi + dátumami na iniciál naplnenie
      - **Notif banner v hlavnej hlavičke** (nielen v /office) keď je due-today
        alebo overdue (aby to admin videl kdekoľvek v aplikácii)

- [ ] **Info@epoxidovo iba admin** — profile menu má „info epoxidovo nechaj
      iba admin". Zatiaľ nie je vynútené — treba pridať kontrolu že email
      `info@epoxidovo.sk` môže mať iba rolu `admin` (nikdy `obchod`).

- [ ] **Nová rola „office"** — momentálne /office prístupné len ako admin.
      Treba pridať skutočnú rolu office do DB + role picker.

---

## 🟡 Priorita 2 — vylepšenia

- [ ] **MATERIÁL DOCENIŤ** — v `lib/data/product-catalog.ts` treba prejsť
      každý produkt a potvrdiť / doplniť cenu:
      - Sikafloor rada (150 Plus, 151, 264, 264 Plus, 2510W, 3310, 3000, ...)
        — TODO potvrdiť ceny podľa Sika cenník 2026 (viac produktov má
        `note: "TODO potvrdiť cenu"`)
      - Bostik XT4 balenia (chýbajú ceny)
      - Chipsy STAVEKON — cena za kg
      - Topstone EP11 Metalic (potvrdené na 662€ / 20 kg)
      - Topstone EP22 Plus lak
      - Kremičitý piesok — potvrdiť cenu
      - Užívateľ toto explicitne pripomenul: **"Daj do poznámky ze material
        docenit"** — 2026-07-04

      Ako to spraviť: prejsť s Peťom Nogom cenník od Siky, potvrdiť
      real ceny + Topstone cenník. Update `cost_per_package` /
      `cost_per_kg` a odstrániť `note: "TODO potvrdiť cenu"` field.

- [ ] **PWA install prompt** — zatiaľ len manifest a meta tagy; treba
      pridať A2HS UI hint na Safari + custom install button na Android Chrome.

- [ ] **Realizator nahráva pred/po foto** — sekcia s pred/po formátom
      side-by-side (portfolio material). Aktuálne len flat gallery.

- [ ] **Cross-role handoff prepojenie** — obchod → obhliadky → realizacie
      handoff je v miestach fungujúci; ale realizator nemá odkiaľ vidieť
      priority a povinné veci od obchodníka. Chýba „handoff notes" pole.

- [ ] **Automatický follow-up po 3× nedvihol** — SMS + Email placeholder
      je v UI („Archivovať" v Nedvíha tabu), ale samotný send provider nie
      je pripojený. Twilio SMS + Resend Email trigger.

---

## ✅ Nedávno dokončené (2026-07)

- ✅ Status label-y — zjednotené tab-y a picker: „🆕 Nové / Kontakt /
     Nezdvíhali / CP / Ukončené / Archivované" všade rovnako
- ✅ Office pripomienky (kalendár) — SQL + API + UI komponent
- ✅ Material catalog — EP11 Metalic BA pre metalicú AJ mramorovú
     (podľa faktúry od Betonace)
- ✅ Lead-card „Upraviť CP" — zobrazí sa aj pre existing quote_sent leady
     (fallback bez saved_quote)
- ✅ Seed leads endpoint — funguje aj v produkcii pre admina (10 test
     leadov pre info@epoxidovo.sk už nasadené)
- ✅ CP Edit + Resend — obchodák si otvorí odoslanú CP, upraví (napr. m² 16→20)
  a klikne "Preposlať upravenú ponuku". Ukladá sa do `lead.data.last_quote`.
- ✅ Admin: Analytika leadov (`/admin/leads-analytika`) — % zdrojov, denný trend,
  mesačné porovnanie, tabuľka posledných 500.
- ✅ Agents table: Upraviť + Odobrať access actions.
- ✅ Profile menu: pauza a status leadov iba pre adminov.
- ✅ Role handoff (obhliadky, realizácie) + termin badge.
- ✅ Resend send flow s PDF prílohou (bez Gmail drag-drop).
- ✅ View-as impersonácia pre admina.
- ✅ Web leads sync (epoxidovo.sk → Neon → cron worker).
- ✅ Meta leads via Zapier (FB Lead Ads → webhook POST).
