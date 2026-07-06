# 🔒 Security Audit — Epoxidovo Manager

**Dátum:** 2026-07-05
**Rozsah:** kompletná security review — auth, RLS, API endpoints, storage, hlavičky, secrets, upload flows.

---

## 🔴 KRITICKÉ — oprav hneď (2)

### 1. DEV BYPASS v `lib/auth.ts` je fragilný single point of failure

**Súbor:** `lib/auth.ts:63-125`

Ak `NODE_ENV !== "production"` (napr. omylom v preview deployi, alebo pri build-time misconfiguration), **každý návštevník je automaticky auto-logged-in ako prvý admin z DB** bez akéhokoľvek auth wallu.

```ts
if (process.env.NODE_ENV !== "production") {
  // ... auto-return prvého admin usera bez auth
}
```

**Aktuálny stav:** app.najcrm.sk má `NODE_ENV=production` (overené — dev endpointy vracajú 403). Dev bypass NIE JE aktívny.

**Riziko:** Ak niekto:
- Deployuje preview branch bez `NODE_ENV=production`
- Alebo NEXT.js build failure spadne späť na `development`

→ Anyone visiting = full admin access. Kompletný security bypass.

**Fix:** Pridať ĎALŠIU vrstvu ochrany — env var `ALLOW_DEV_AUTH_BYPASS=1` ktorý musí byť EXPLICITE zapnutý, inak žiadny bypass ani v dev móde:

```ts
if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_AUTH_BYPASS === "1") {
  // dev bypass...
}
```

Alebo lepšie: úplne odstrániť dev bypass a používať skutočný login flow aj v dev.

### 2. Supabase secret key hardcoded v `/tmp/seed-*.mjs`

**Súbory:**
- `/tmp/seed-leads.mjs:3` → `const SECRET = "sb_secret_REDACTED_xxxxxxxxxxxxxxxxxxxxxxxx"`
- `/tmp/seed-obhliadky.mjs:5` → to isté

**Riziko:** Plaintext service_role key na disku. Ktokoľvek s prístupom k Macu (aj cez `find /tmp`) ho vidí. Aj časované temp cleanup neni istota.

**Fix:**
```bash
rm /tmp/seed-leads.mjs /tmp/seed-obhliadky.mjs
```

Budúce seed skripty MUSIA načítať kľúč z env:
```js
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SECRET) throw new Error("SUPABASE_SECRET_KEY nie je nastavený");
```

---

## 🟠 VYSOKÉ — treba opraviť (3)

### 3. Avatars storage bucket policies — user môže overwrite AVATAR iného usera

**Súbor:** `supabase/20_user_avatars.sql:30-51`

Aktuálne policies:
```sql
CREATE POLICY "avatars_write_own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);
```

Tato policy povoľuje **KAŽDÉMU authenticated userovi upload/update/delete OBJECTU v akéhkoľvek folderi** v `avatars` bucket-e. Path pattern je `{user_id}/{timestamp}.jpg`, takže user by mohol napr. uploadovať s path `<niekoho_iného_id>/hack.jpg` a prepísať mu avatar.

**Aktuálne mitigované:** API endpoint `/api/user/avatar` používa `createAdminClient()` (bypass RLS) a nastaví path na `${user.id}/${timestamp}.${ext}`. Takže cez naše UI nikto nič nespraví.

**Ale:** Ak niekto pošle raw request na Supabase Storage priamo s vlastným auth tokenom (napr. cez Postman), RLS policy ho nezastaví. Anyone-authenticated-can-overwrite-anyone.

**Fix:** Doplniť folder check do policy:
```sql
DROP POLICY IF EXISTS "avatars_write_own" ON storage.objects;
CREATE POLICY "avatars_write_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Podobne pre UPDATE a DELETE
```

To isté treba pre `inspection-media` a `realization-media` — momentálne aj tie povoľujú komukoľvek s rolou obhliadky/realizacie zapisovať čokoľvek do akéhokoľvek `{lead_id}/` foldera.

### 4. `/api/health` vypisuje diagnostiku bez auth (info leak)

**Súbor:** `app/api/health/route.ts:1-78`

Vracia:
- Environment status (env vars set alebo not)
- Supabase URL a auth endpoint latency
- Aktuálne prihláseného usera email (`data?.user?.email`)

**Riziko:**
- Attacker vie zistiť či beží Supabase, latency, technológie
- Ak niekto zavolá `/api/health` s obetiovým cookie (napr. cez SSRF na inej appke), dozvie sa email obete

**Fix:** Vyžadovať admin auth alebo minimálne aspoň autentifikáciu:
```ts
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: true, status: "healthy" }); // minimum info
  }
  // full diagnostics len pre admin
}
```

### 5. Chýba rate limiting na sensitívnych endpointoch

**Súbory:** `app/api/lead/reveal-phone`, `app/api/quote/send`, `app/api/user/avatar`, `app/api/agent/leads-search`

Žiadny rate limit. Attacker s valid session môže:
- Spam `reveal-phone` → generuje SLA activity + audit záznamy
- Spam `quote/send` → míňa Resend kvótu, spam zákazníkov
- Spam `avatar` upload → plní storage (5 MB × N = drahé)
- Spam `leads-search` → zbieranie kontaktov (aj keď oscopený na assigned_to)

**Fix:** Pridať Cloudflare Rate Limiting Rule alebo simple in-memory rate limiter (napr. `@upstash/ratelimit` s Cloudflare KV).

Konkrétne minimum:
- Quote send: 20 / hodinu / user
- Avatar upload: 5 / minútu / user
- Reveal phone: 60 / hodinu / user (ochrana proti bulk data scraping)

---

## 🟡 STREDNÉ — pekné mať (4)

### 6. CSP header má `'unsafe-inline'` + `'unsafe-eval'`

**Response header:**
```
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; ...
```

**Riziko:** Next.js s server components používa inline scripts + eval. `unsafe-inline` znižuje účinnosť CSP proti XSS. Aktuálne to je kompromis — bez toho Next.js nefunguje.

**Fix:** Migrácia na nonce-based CSP (Next.js 15+ podporuje). Vyžaduje middleware ktorý generuje unique nonce per request.

### 7. Anti-CSRF nie je explicitne implementovaný

Server actions v Next.js majú **default CSRF protection** cez SameSite cookies + Origin verification. Ale plain API endpointy (`/api/lead/action`, `/api/quote/send`, etc.) sa spoliehajú iba na cookie-based session. Pri exotic CORS attacks alebo XS-Leaks môže dôjsť k problému.

**Aktuálne mitigované:** Supabase session cookie je httpOnly + SameSite=Lax, čo mitiguje najbežnejšie CSRF vektory.

**Fix (voliteľný):** Custom `Origin` / `Referer` check na API endpointoch:
```ts
const origin = request.headers.get("origin");
if (origin && !origin.startsWith("https://app.najcrm.sk")) {
  return NextResponse.json({ ok: false, error: "csrf" }, { status: 403 });
}
```

### 8. `/api/dev/*` — 8 endpointov spolieha IBA na NODE_ENV check

Rovnaký fragility problém ako #1. Ak `NODE_ENV !== "production"` → attacker môže:
- `/api/dev/set-admin` → nastaviť si admin rolu
- `/api/dev/get-otp` → dostať OTP kód pre akéhokoľvek usera
- `/api/dev/login` → prihlásiť sa ako ktokoľvek
- `/api/dev/seed-leads` → naplniť DB spam-om

**Fix:** Pridať ĎALŠIU vrstvu — vyžadovať `X-Dev-Token` header ktorý musí sedieť s `DEV_ACCESS_TOKEN` env var. Ak env chýba, dev endpointy sú **úplne vypnuté** (aj v dev).

### 9. `x-powered-by: Next.js` header — leak framework verzie

Umožňuje attackerovi cielenú kampaň proti známym Next.js vulnerabilities.

**Fix:** V `next.config.js`:
```js
module.exports = {
  poweredByHeader: false,
  // ...
};
```

---

## 🟢 DOBRE ZABEZPEČENÉ (pre pochvalu)

1. ✅ **Webhook `/api/webhook/lead/[source_id]`** — constant-time secret compare proti timing attacks
2. ✅ **Meta webhook** — `META_WEBHOOK_VERIFY_TOKEN` handshake
3. ✅ **`/api/quote/send`** — anti-spoofing check (agent_email musí sedieť s user.email), `sanitizeHeader` proti email header injection, max lengths na subject / body
4. ✅ **`/api/setup`** — SETUP_TOKEN guard v produkcii
5. ✅ **`/api/cron/*`** — X-Cron-Secret header + constant-time compare
6. ✅ **Ownership checks** — reveal-phone, lead/action, lead/note, admin/contacts — všetky overujú `assigned_to === user.id || role === 'admin'`
7. ✅ **RLS na `contacts`** — iba admin má prístup
8. ✅ **RLS na `office_reminders`** — user vidí svoje, admin všetky
9. ✅ **RLS na `calendar_notes`** (po SQL 18) — recipient + creator + obchodáci vidia, ostatní iba svoje
10. ✅ **RLS na `inspection_media`** — obmedzené na admin/obchod/obhliadky
11. ✅ **HSTS header** — 2-ročný max-age + preload
12. ✅ **X-Frame-Options: SAMEORIGIN** — clickjacking protection
13. ✅ **X-Content-Type-Options: nosniff** — MIME sniffing block
14. ✅ **Referrer-Policy: strict-origin-when-cross-origin**
15. ✅ **Permissions-Policy** — camera/mic/geo blokované defaultne
16. ✅ **X-Robots-Tag: noindex, nofollow** — nie je v Google
17. ✅ **Upload endpoints** — MIME type + size limits (avatar 5MB, inspection 25MB, realization 50MB), ownership check, sanitized filename
18. ✅ **Fallback DB queries** — kód nespadne ak SQL migrácia chýba, len feature nefunguje
19. ✅ **`.env.local` v `.gitignore`** — secrets nie sú v gite
20. ✅ **žiadny `dangerouslySetInnerHTML`** — žiadny XSS vector cez raw HTML
21. ✅ **PostgREST escape** — všetky user inputs cez `.eq()`, `.ilike()`, `.or()` — SQL injection nemožný cez Supabase client
22. ✅ **Session cookies** — httpOnly + SameSite=Lax (Supabase default)

---

## 🎯 Akčný plán — poradie priority

### Do 24 hodín (kritické)
1. `rm /tmp/seed-leads.mjs /tmp/seed-obhliadky.mjs`
2. Fix `lib/auth.ts` dev bypass (pridať `ALLOW_DEV_AUTH_BYPASS` env guard)

### Do týždňa (vysoké)
3. Fix avatars/inspection-media/realization-media bucket policies (folder-based ownership)
4. Fix `/api/health` (auth + minimal info)
5. Rate limiting na sensitívne endpointy

### Do mesiaca (stredné)
6. CSP nonce migration
7. Explicit Origin check na API endpointoch
8. Doplniť DEV_ACCESS_TOKEN pre `/api/dev/*`
9. `poweredByHeader: false`

### Priebežne
- Rotácia SUPABASE_SECRET_KEY (kompromitovaný v `/tmp/*.mjs`) — vygeneruj nový v Supabase Dashboard, update Cloudflare env var
- Rotácia RESEND_API_KEY (ak si ju používal v skriptoch)

---

## 📋 Rotácia kľúčov — návod

1. **Supabase secret key** (`sb_secret_REDACTED_xxxxxxxxxxxxxxxxxxxxxxxx` — leakol v `/tmp/*.mjs`)
   - Supabase Dashboard → Project Settings → API → **Reset service_role key**
   - Skopíruj nový kľúč
   - `npx wrangler pages secret put SUPABASE_SECRET_KEY --project-name=bdsmanagerr`
   - Update `.env.local` lokálne

2. **Cron secret** (skontroluj či nie je nikde vypísaný)
   - Vygeneruj nový: `openssl rand -hex 32`
   - `npx wrangler pages secret put CRON_SECRET --project-name=bdsmanagerr`
   - `cd cron-worker && npx wrangler secret put CRON_SECRET`

---

## Zhrnutie

**Overall grade: B+**

CRM má solídne security foundations (webhook secrets, ownership checks, RLS, hlavičky). Hlavné riziká sú v dev-bypass fragilite a leakovanom secret kľúči v temp súboroch.

Po oprave 2 kritických issues (#1, #2) sa grade posunie na **A-**.
Po oprave 5 vysokých/kritických sa grade posunie na **A**.
