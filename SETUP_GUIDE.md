# 🚀 Epoxidovo Manager — Setup Guide

Krok-za-krokom všetko čo treba spustiť aby CRM fungoval na 100%.

Odhad času: **~15 minút** (najviac 5 minút SQL Editor + 5 minút Meta config).

---

## 1️⃣ Supabase SQL migrácie (5 min)

**Cez Supabase dashboard → SQL Editor → New query.**

Migrácie sú v repo v `/Users/puska/bdsmanager/supabase/`. Súbory sú číslované — spusti ich v poradí. **Môžeš ich vložiť všetky naraz do jedného okna** a spustiť.

### Ktoré ešte NIE SÚ spustené (podľa TODO):

| # | Súbor | Čo robí |
|---|-------|---------|
| 10 | `10_role_handoff.sql` | Statusy `needs_inspection` + `in_realization`, handoff stĺpce, realization_media bucket |
| 11 | `11_office_reminders.sql` | Tabuľka `office_reminders` pre pripomienky v `/office` |
| 12 | `12_role_skolenie.sql` | Nová rola `skolenie` (onboarding) |
| 13 | `13_search_diacritics.sql` | `unaccent` extension → search bez diakritiky |
| 14 | `14_contacts.sql` | Adresár kontaktov + 2 seed rows (Peťo Noga, Teta objednávky) |
| 15 | `15_inspection_media.sql` | Storage bucket + tabuľka pre foto z obhliadok |
| 16 | `16_user_home_city.sql` | `users.home_city` (auto-preselect obhliadkára) |
| 17 | `17_inspected_auto_transition.sql` | Status `inspected` + funkcia `auto_transition_inspected()` |
| 18 | `18_calendar_shared_visibility.sql` | Zdieľaná viditeľnosť calendar_notes (obchodáci vidia team) |

### Rýchly spôsob — kopíruj-vlož všetkých 9

```bash
# V terminále — vygeneruj mega SQL file
cd /Users/puska/bdsmanager/supabase
cat 10_role_handoff.sql \
    11_office_reminders.sql \
    12_role_skolenie.sql \
    13_search_diacritics.sql \
    14_contacts.sql \
    15_inspection_media.sql \
    16_user_home_city.sql \
    17_inspected_auto_transition.sql \
    18_calendar_shared_visibility.sql \
    | pbcopy
# Otvor Supabase → SQL Editor → paste (⌘V) → Run
```

Ak nechceš cez terminál, otvor každý súbor v editore, skopíruj obsah, prilep do SQL Editora, klikni **Run**. Poradie čísel dôležité.

**Overenie že to prešlo:**
```sql
-- v SQL Editore spusti:
SELECT COUNT(*) FROM public.contacts;                    -- má vrátiť 2
SELECT column_name FROM information_schema.columns
  WHERE table_name='users' AND column_name='home_city';  -- vráti 'home_city'
```

---

## 2️⃣ Seed test leadov (0.5 min)

**Prihlás sa ako admin** na `https://app.najcrm.sk` (email: `info@epoxidovo.sk`), potom otvor v tom istom browsera:

```
https://app.najcrm.sk/api/dev/seed-leads-for-agent?email=info@epoxidovo.sk&count=10
```

Vidíš JSON s `"ok":true, "count":10` → hotovo. V leade sekcii tab **Nové** by malo pribudnúť ~10 test leadov.

---

## 3️⃣ Meta Lead Form — termin mapping (5 min)

Ideš do **Meta Business Suite → Ads Manager → Facebook Lead Form**. Pri custom otázke „Plánovaný termín realizácie" nastav **PRESNE tento zoznam odpovedí** (musí sedieť s webom + CRM):

- `Čo najskôr`
- `Do 1 mesiaca`
- `Do 3 mesiacov`
- `Do 6 mesiacov`
- `Zatiaľ len zisťujem informácie`

V Zapieri v „Webhooks by Zapier → POST" v mappingu daj:
```
data.termin = <Facebook Lead Form odpoveď na tú otázku>
```

CRM ich rovnako mapuje bez ohľadu na zdroj (web / Meta). Pozri `app/api/cron/sync-epoxidovo/route.ts` — TERMIN_LABELS.

---

## 4️⃣ Deploy epoxidovo.sk s Prisma migration (2 min)

Repo `/Users/puska/epoxidovo`. Prisma schéma má `termin` field pridaný, ale ešte nedeploy-nutý:

```bash
cd /Users/puska/epoxidovo
npx prisma migrate deploy      # aplikuje pending migrations na Neon DB
git push origin main            # trigger Vercel auto-deploy
```

---

## 5️⃣ GitHub push (manuálne — nemôžem to spraviť ja) (1 min)

Aktuálne remote v `/Users/puska/bdsmanager` je `github.com/Gonzalespuska/BDSMANAGERR.git` a **404 error**. Moje credentials v keychainu sú pre iný účet (Veelynsk).

Riešenie:
```bash
cd /Users/puska/bdsmanager
# Zisti aký je správny remote URL:
gh repo view --web           # alebo cez GitHub Desktop
# Nastav správny URL:
git remote set-url origin https://github.com/Gonzalespuska/<spravny_repo_name>.git
# Push všetky commity:
git push origin main
```

CI/CD (Cloudflare Pages) funguje aj bez toho — `wrangler pages deploy` deploy-uje priamo. Ale história je iba lokálna.

---

## 6️⃣ Testni funkcionality (5 min)

### 6a. Nový lead flow
- Otvor `/agent` — vidíš **Nové (10)** — teet leady sú tam
- Klik na lead → **Odhaliť číslo** → **Zavolať** (tel: link)

### 6b. Cenová ponuka
- Otvor lead → klik **Ponuka** alebo **Poslať cenovú ponuku**
- Zvol podlahu (Chipsová, Metalická…) → m² → **Pošli email s ponukou**
- Prídi kontrola email do info@epoxidovo.sk BCC

### 6c. Upraviť CP
- Lead so status quote_sent → klik **Upraviť CP** — otvorí generátor s pôvodnými číslami

### 6d. Cross-role handoff (SQL 10 musí byť aplikovaný)
- Lead → **Poslať na obhliadku** → naviguje na `/calendar?assign=inspection&lead=…`
- Vidíš banner s profilom leadu + klik na deň → modal s **poznámkou**
- (Person picker + confirm submit — TODO, zatiaľ manuálne cez lead-card)

### 6e. Kontakty
- `/admin/kontakty` — vidíš Peťo Noga + Teta objednávky
- Klik **Upraviť** → doplň telefón + email

### 6f. Home city obhliadkára
- `/admin/agents/[id]` (obhliadkár) → sekcia **Domovské mesto**
- Nastav napr. „Bratislava" → uložiť
- Vytvor lead s lokalitou Bratislava → **Poslať na obhliadku** → obhliadkár s home_city=Bratislava sa auto-preselectne

### 6g. Notifikácie
- **Kurzor na 🔔 zvonček** (desktop) → automatický peek
- **Klik** → naviguje na `/notifikacie` celú stránku

### 6h. Kalendár + Prehľad
- `/calendar` — kalendár mesiaca + Prehľad panel dole
- Sekcia **💡 Checkni si kedy sa oplatí** — napíš mesto, vidíš návrh dátumu + času

### 6i. Obhliadnuté tab
- `/agent` — nový tab **✔️ Obhliadnuté** medzi CP a Archivované
- Po SQL 17 sa sem auto-presunú lead s prešlým `inspection_at`

---

## 7️⃣ Cron worker — treba doplniť RPC volanie

Cron worker (`cron-worker/src/index.ts`) beží každých 5-10 min. Treba mu pridať volanie:

```ts
// v cron-worker/src/index.ts scheduled fn
await sb.rpc('auto_transition_inspected');
```

Bez toho auto-transition CP → Obhliadnuté nefunguje (manuálne cez picker funguje).

---

## 🗺️ Mapa URL-ov

| URL | Kto | Čo |
|-----|-----|-----|
| `/agent` | obchod, admin | Leady na volanie (Nové/Kontakt/…) |
| `/obhliadky` | obhliadky, admin | Priradené obhliadky |
| `/realizacie` | realizacie, admin | Priradené realizácie |
| `/office` | office, admin | Pripomienky (kalendár) |
| `/skolenie` | skolenie, admin | Onboarding videá + PDF |
| `/calendar` | všetci | Kalendár (obchod = plánovanie; obhliadky/realizacie = svoje) |
| `/generator` | všetci s prístupom | Generátor cenových ponúk |
| `/notifikacie` | všetci | Callbacky + úlohy + reminder |
| `/admin` | iba admin | Admin panel |
| `/admin/agents` | admin | Správa tímu |
| `/admin/agents/[id]` | admin | Detail agenta + edit + odobrať access |
| `/admin/kontakty` | admin | Externí kontakti (Sika, Topstone…) |
| `/admin/leads-analytika` | admin | Analytika leadov + charts |
| `/admin/prehlad` | admin | Supervision view |

---

## ⚙️ Dev commands

```bash
# Lokálny dev (nefunguje s edge runtime perfektne, používaj Cloudflare Pages)
cd /Users/puska/bdsmanager && npm run dev

# Build pre Cloudflare
npm run pages:build

# Deploy priamo na Cloudflare Pages (bez GitHubu)
npm run pages:deploy
# alebo krátko:
npx wrangler pages deploy .vercel/output/static --project-name=bdsmanagerr --branch=main

# Sledovanie deploy logov
wrangler pages deployment tail --project-name=bdsmanagerr
```

---

## 📋 Checklist — musíš spraviť ty

- [ ] Spustiť SQL migrácie 10-18 v Supabase SQL Editore
- [ ] Seedni 10 test leadov (URL hit s prihláseným adminom)
- [ ] Meta Lead Form — nastaviť termin zoznam
- [ ] Zapier — mapping termin → data.termin
- [ ] Deploy epoxidovo.sk s Prisma migration
- [ ] GitHub push (manuálne cez tvoje credentials)
- [ ] Nastaviť telefón v `/admin/agents/[id]` pre každého obchodníka (pre PDF footer)
- [ ] Nastaviť `home_city` pre obhliadkárov a realizatorov (pre auto-preselect)
- [ ] Doplniť ceny do `lib/data/product-catalog.ts` — Peťo Noga potvrdí Sika + Topstone cenník

---

## 🆘 Ak niečo padá

- **„db_error" pri Poslať na obhliadku** → SQL 10 nebola spustená
- **„relation office_reminders does not exist"** → SQL 11 nebola spustená
- **Search bez diakritiky nefunguje** → SQL 13 nebola spustená
- **Home city nezobrazujem v `/admin/agents/[id]`** → SQL 16 nebola spustená
- **Kalendár Pridať poznámku nefunguje** → SQL 07 (starý) nebola spustená ALEBO SQL 18 chýba

Deploy check:
```bash
curl -s https://app.najcrm.sk/ | grep -o "Epoxidovo Manager" | head -1
# Vráti 1× "Epoxidovo Manager" ak deploy je live
```

---

*Ak niečo nefunguje, otvor Cloudflare Pages logs alebo Supabase Postgres logs. Väčšina chýb sa dá nájsť v Cloudflare deploy logs.*
