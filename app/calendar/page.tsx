import { Calendar as CalendarIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";
import {
  CalendarGrid,
  type CalendarCallback,
  type CalendarNote,
} from "./calendar-grid";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ m?: string }>;
}

/**
 * /calendar — mesačný kalendár agenta s poznámkami per deň + pripomienky volaní.
 *
 * Query param `?m=YYYY-MM` umožňuje deep-linkovať na konkrétny mesiac
 * (default = aktuálny). Klient sa potom medzi mesiacmi prepína bez reloadu.
 */
export default async function CalendarPage({ searchParams }: Props) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const initialMonth =
    params.m && /^\d{4}-\d{2}$/.test(params.m)
      ? params.m
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Pre kalendár pracujeme s mesiacom ±1 (aby boli pokryté susedné týždne)
  const [yearStr, monthStr] = initialMonth.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr);
  const fromDate = new Date(year, monthIdx - 2, 1);
  const toDate = new Date(year, monthIdx + 1, 0, 23, 59, 59);

  const admin = createAdminClient();
  const [{ data: notesRows }, { data: callbackRows }] = await Promise.all([
    admin
      .from("calendar_notes")
      .select("id, date, body, created_at")
      .eq("user_id", me.id)
      .gte("date", fromDate.toISOString().slice(0, 10))
      .lte("date", toDate.toISOString().slice(0, 10))
      .order("created_at", { ascending: true }),
    admin
      .from("leads")
      .select("id, name, phone, next_callback_at, call_attempts")
      .eq("assigned_to", me.id)
      .not("next_callback_at", "is", null)
      .gte("next_callback_at", fromDate.toISOString())
      .lte("next_callback_at", toDate.toISOString())
      .order("next_callback_at", { ascending: true }),
  ]);

  const notes: CalendarNote[] = (notesRows ?? []).map((n) => ({
    id: n.id,
    date: n.date,
    body: n.body,
    created_at: n.created_at,
  }));

  const callbacks: CalendarCallback[] = (callbackRows ?? []).map((c) => ({
    lead_id: c.id,
    lead_name: c.name,
    phone: c.phone,
    at: c.next_callback_at,
    attempts: c.call_attempts ?? 0,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <CalendarIcon className="w-6 h-6 text-sky-500" aria-hidden />
          Kalendár
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tvoj osobný mesačný kalendár. Klikni na deň pre poznámky a
          pripomienky volaní.
        </p>
      </header>

      <CalendarGrid
        initialMonth={initialMonth}
        notes={notes}
        callbacks={callbacks}
      />
    </div>
  );
}
