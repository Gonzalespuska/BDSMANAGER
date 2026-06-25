import { Calendar as CalendarIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAppUser } from "@/lib/auth";
import {
  CalendarGrid,
  type CalendarCallback,
  type CalendarNote,
} from "./calendar-grid";
import { NotesPanel } from "./notes-panel";
import type { NotePayload } from "./notes-actions";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ m?: string }>;
}

/**
 * /calendar — kalendár (vľavo, kompaktný) + Apple-Notes-like panel (vpravo).
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

  const [yearStr, monthStr] = initialMonth.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr);
  const fromDate = new Date(year, monthIdx - 2, 1);
  const toDate = new Date(year, monthIdx + 1, 0, 23, 59, 59);

  const admin = createAdminClient();
  const [{ data: notesRows }, { data: callbackRows }, { data: generalNotes }] =
    await Promise.all([
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
      admin
        .from("notes")
        .select("id, title, body, pinned, updated_at")
        .eq("user_id", me.id)
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);

  const calendarNotes: CalendarNote[] = (notesRows ?? []).map((n) => ({
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

  const notesForPanel: NotePayload[] = (generalNotes ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    pinned: !!n.pinned,
    updated_at: n.updated_at,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight inline-flex items-center gap-2">
          <CalendarIcon className="w-6 h-6 text-sky-500" aria-hidden />
          Kalendár
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kalendár s pripomienkami volaní vľavo, voľné Apple-Notes-like
          poznámky vpravo. Klikni na deň pre detail.
        </p>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 items-start">
        <CalendarGrid
          initialMonth={initialMonth}
          notes={calendarNotes}
          callbacks={callbacks}
        />
        <NotesPanel initial={notesForPanel} />
      </div>
    </div>
  );
}
