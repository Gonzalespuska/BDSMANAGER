# Epoxidovo Manager — Running TODO

Otvorené úlohy a plánované features. Aktualizuje sa priebežne.

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

## 🔴 Priorita 1 — obchodníci ju kričia

- [ ] **Info kanál (rola 'info')** — kombinovateľná rola k obchod/obhliadky/realizacie.
      Odomkne tab 'Info' v navigácii s videami a PDF podkladmi:
      - Obchod: rozdiel epoxid vs polyuretán, ako použiť generátor, argumenty proti námietkam
      - Obhliadkár: scenár čo sa pýtať, ako správne merať
      - Realizátor: bezpečnosť, technológia, ako fotografovať
      DB: `users.roles: text[]` namiesto `role: text` (migration).

- [ ] **Inventúra / sklad** — admin tabuľka materiálu (Bostik XT4, chipsy, laky…).
      Realizator pri zákazke označí "mám pripravené veci" → odpočíta zo skladu.
      Audit log s timestamps kto kedy čo bral.

## 🟡 Priorita 2 — vylepšenia

- [ ] **PWA push notifikácie** — obchodák dostane notif pri novom leade.
      Manifest už existuje, treba service worker + Web Push subscription.

- [ ] **"Iba materiál" ceny** — 9 TODO cien v `lib/data/product-catalog.ts`.
      Bostik XT4 balenia, kompletné hardener sety, chipsy 1 kg cena.

## ✅ Nedávno dokončené (2026-06)

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

## ⚠️ Ručné akcie čakajúce na usera

- [ ] Deploy epoxidovo.sk s Prisma migration pre `termin` field
- [ ] V Zapieri pridať mapping FB `when` → CRM `data.termin`
- [ ] Spustiť `supabase/10_role_handoff.sql` v SQL Editor
