# 🔧 FIX GUIDE — čo, kde, ktorý účet

Presne kde ísť, akým účtom sa prihlásiť, čo kliknúť. Bez blbostí.

---

## Problém: „addCalendarNoteAction" nefunguje (Pridať v kalendári)

**Príčina:** V DB chýbajú stĺpce `kind`, `target_user_id`, `lead_id` na tabuľke `calendar_notes`. Kód sa ich pokúša insert-núť a padne s DB error.

**Fix:** Spustiť SQL migrácie v Supabase.

---

## 🔑 Účty — čo kde použiť

| Služba | Účet | Prečo |
|--------|------|-------|
| **Supabase** | `gonzalespuska@gmail.com` | Owner CRM databázy `wzcehdynanuuzztfrqyi` |
| **Cloudflare** | `gonzalespuska@gmail.com` | Owner Pages projektu `bdsmanagerr` (naša app.najcrm.sk) |
| **GitHub CRM repo** | `Gonzalespuska` (nie Veelynsk) | Repo `bdsmanagerr` |
| **GitHub epoxidovo.sk repo** | `Gonzalespuska` | Web repo pre Vercel deploy |
| **Vercel epoxidovo.sk** | `gonzalespuska@gmail.com` | Deploy webu epoxidovo.sk |
| **Meta Business Suite (FB Ads)** | `gonzalespuska@gmail.com` alebo firemné FB | Lead Form nastavenia |
| **Zapier** | `gonzalespuska@gmail.com` | Meta Lead Form → CRM webhook |
| **Resend** | Používa API kľúč `RESEND_API_KEY` z Cloudflare env — netreba sa prihlasovať |
| **Neon (Postgres pre epoxidovo.sk)** | `gonzalespuska@gmail.com` | Web DB |

**Info@epoxidovo.sk** — to je iba admin login do CRM (app.najcrm.sk). NIE Cloudflare / Supabase účet.

---

## 📋 KROK 1: SQL migrácie (5 min)

### 1a. Otvor Supabase

Choď na **https://supabase.com/dashboard**. Prihlás sa cez **Google → gonzalespuska@gmail.com**.

Klikni na projekt **wzcehdynanuuzztfrqyi** (alebo „epoxidovo" / „bdsmanager" — má tento identifier).

### 1b. Otvor SQL Editor

Ľavý sidebar → **SQL Editor** (ikona `</>`).

Klik **+ New query** (vpravo hore).

### 1c. Skopíruj všetky pending migrácie naraz

Otvor terminál na Macu:

```bash
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
    19_phone_normalized_search.sql | pbcopy
```

Príkaz nakopíroval všetkých 10 migrácií do clipboardu.

### 1d. Prilep do SQL Editora + Run

- V Supabase SQL Editore stlač **⌘V** (alebo Cmd+V)
- Klikni zeleny **Run** button vpravo dole (alebo ⌘Enter)
- Počkaj ~10-30 sekúnd

### 1e. Overenie

V SQL Editore napíš do nového query:

```sql
-- Overí že všetko prešlo:
SELECT
  (SELECT COUNT(*) FROM public.contacts) AS contacts_count,
  (SELECT COUNT(*) FROM public.office_reminders) AS reminders_count,
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='home_city') AS home_city_exists,
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='leads' AND column_name='phone_digits') AS phone_digits_exists,
  EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_name='leads' AND column_name='inspection_by') AS handoff_exists;
```

Očakávaš:
- `contacts_count = 2` (Peťo Noga + Teta objednávky)
- `home_city_exists = true`
- `phone_digits_exists = true`
- `handoff_exists = true`

Ak niečo `false` alebo query padne — spusti len tú konkrétnu migráciu samostatne.

---

## 📋 KROK 2: Seed test leadov (30 sekúnd)

Prihlás sa v browsera na **https://app.najcrm.sk** ako `info@epoxidovo.sk`.

V tom istom browsera otvor URL:

```
https://app.najcrm.sk/api/dev/seed-leads-for-agent?email=info@epoxidovo.sk&count=10
```

Vidíš JSON `{"ok":true,"count":10}` → hotovo. Nové leady sú v tabe **Nové**.

---

## 📋 KROK 3: Otestuj Kalendár Pridať (30 sekúnd)

- Choď na **app.najcrm.sk/calendar**
- Klikni na dnešný deň
- Napíš „test" do poľa poznámky
- Klikni **Pridať**

**Ak funguje** — SQL migrácie prebehli. ✅

**Ak stále nefunguje** — otvor Chrome DevTools (⌥⌘I) → Console → skús znovu a napíš mi error msg.

---

## 📋 KROK 4: GitHub push (5 min, môžeš vynechať)

Aktuálne remote je 404 (`Gonzalespuska/BDSMANAGERR.git`). Deploy funguje aj bez GitHub (cez wrangler priamo), ale história je iba lokálne.

### 4a. Nájdi správne meno repa
Otvor **https://github.com/Gonzalespuska?tab=repositories** v browsera (prihlás sa ako Gonzalespuska).

Nájdi CRM repo — pravdepodobne sa volá `bdsmanager` alebo `epoxidovo-manager` alebo `crm`.

### 4b. Update remote URL

V terminále:
```bash
cd /Users/puska/bdsmanager
git remote set-url origin https://github.com/Gonzalespuska/<meno-repa>.git
```

### 4c. Push (nutné, keby si push-oval z tohto stroja)
```bash
git push origin main
```

Pri prvom push vyskočí popup — prihlás sa cez **Gonzalespuska** účet (nie Veelynsk).

**Alternatíva:** Otvor GitHub Desktop (ak máš) → prepni na CRM repo → Push.

---

## 📋 KROK 5: Meta Lead Form termin (5 min, iba keď spúšťaš FB kampaň)

### 5a. Prihlás sa
**https://business.facebook.com** — Facebook Business (najskôr Gonzalespuska FB alebo firemné Epoxidovo FB).

### 5b. Ads Manager → Lead Forms
Meta Business Suite → **All Tools** → **Lead Ads Forms** (alebo Instant Forms).

Otvor existujúci lead form pre Epoxidovo (alebo vytvor nový).

### 5c. Custom question — Termin
Prejdi na **Questions** krok. Klik **+ Add question** → **Custom question** → **Multiple choice**.

**Otázka:** „Kedy chcete realizovať?"

**Odpovede (presne takto — copy-paste):**
```
Čo najskôr
Do 1 mesiaca
Do 3 mesiacov
Do 6 mesiacov
Zatiaľ len zisťujem informácie
```

Save.

### 5d. Zapier — mapping
**https://zapier.com** → prihláš sa ako `gonzalespuska@gmail.com`.

Otvor existujúci Zap (Facebook Lead Ads → Webhooks POST) alebo vytvor nový.

Pri step **Webhooks by Zapier — POST**, v **Data** sekcii pridaj:

```
Key:    data.termin
Value:  <klik ceruzka a zvol tú Custom question "Kedy chcete realizovať?">
```

Publish Zap.

---

## 📋 KROK 6: Deploy epoxidovo.sk (2 min)

Prihlás sa cez **Vercel** ak treba: **https://vercel.com** — `gonzalespuska@gmail.com`.

V terminále:
```bash
cd /Users/puska/epoxidovo
npx prisma migrate deploy    # aplikuje termin field na Neon DB
git add -A
git commit -m "Prisma migrate: termin field"
git push origin main         # Vercel auto-deploy
```

Ak `git push` pýta credentials, prihlas sa ako **Gonzalespuska**.

---

## 🆘 Ak niečo padá

### „Failed to fetch" v Supabase SQL Editore
Refresh stránku, prihlás sa znova.

### „Permission denied" pri git push
Používaš zlý účet. Prepíš remote URL:
```bash
git remote set-url origin https://Gonzalespuska@github.com/Gonzalespuska/<repo>.git
```

### Cloudflare env vars zle
```bash
npx wrangler pages secret list --project-name=bdsmanagerr
# Kontrola: SUPABASE_SECRET_KEY, RESEND_API_KEY, EPX_DATABASE_URL, CRON_SECRET
```

### Chcem vidieť live deploy logy
```bash
npx wrangler pages deployment tail --project-name=bdsmanagerr
```

---

## Checklist ku každému kroku

- [ ] Krok 1 — SQL migrácie 10-19 spustené v Supabase (5 min)
- [ ] Krok 2 — Seed 10 test leadov (30 sec)
- [ ] Krok 3 — Test Kalendár Pridať (30 sec)
- [ ] Krok 4 — GitHub push (5 min, voliteľné)
- [ ] Krok 5 — Meta Lead Form termin (5 min, keď treba)
- [ ] Krok 6 — Deploy epoxidovo.sk (2 min)

**Celkom: ~20 minút.**

Po tomto všetkom bude CRM 100% funkčný.
