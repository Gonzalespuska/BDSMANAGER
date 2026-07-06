import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookUser } from "lucide-react";

import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { ContactsClient, type ContactRow } from "./contacts-client";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /admin/kontakty — adresár kontaktov pre admin.
 *
 * Nie sú prepojené na žiadne integrácie (nie sú v žiadnom flow) — iba
 * referencia. Admin ich manuálne pridáva / edituje. Použitie: Peťo Noga
 * (Sika), teta objednávky, účtovníčka, prepravca, elektrikár, ...
 */
export default async function AdminKontaktyPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const sb = createAdminClient();
  const { data } = await sb
    .from("contacts")
    .select("*")
    .order("company", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const contacts = (data ?? []) as ContactRow[];

  return (
    <div className="space-y-4">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-sky-700 mb-1 px-2 py-1 rounded-md hover:bg-sky-50/60 transition-colors w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
        Späť na admin
      </Link>

      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <BookUser className="w-6 h-6 text-sky-500" aria-hidden />
          Kontakty
          <span className="text-sky-500 tabular-nums">({contacts.length})</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Adresár externých kontaktov — dodávatelia, servisy, partneri.
          Nie sú prepojené na integrácie, iba referencia. Uprav / doplň
          manuálne.
        </p>
      </header>

      <ContactsClient initial={contacts} />
    </div>
  );
}
