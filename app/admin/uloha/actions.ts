"use server";

import { redirect } from "next/navigation";
import { getCurrentAppUser, getRealUserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * createTaskAction — admin priradí úlohu tímovému členovi.
 * Ukladá do office_reminders (user_id = target user).
 */
export async function createTaskAction(formData: FormData) {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login");
  const realRole = await getRealUserRole();
  if (realRole !== "admin") redirect("/agent");

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const remindDate = String(formData.get("remind_date") ?? "").trim();

  if (!targetUserId) {
    redirect("/admin/uloha?err=" + encodeURIComponent("Chýba človek — zvoľ komu úloha patrí."));
  }
  if (!note || note.length < 3) {
    redirect("/admin/uloha?err=" + encodeURIComponent("Napíš aspoň 3 znaky popisu úlohy."));
  }
  if (note.length > 500) {
    redirect("/admin/uloha?err=" + encodeURIComponent("Popis úlohy je pridlhý (max 500)."));
  }
  if (!remindDate || !/^\d{4}-\d{2}-\d{2}$/.test(remindDate)) {
    redirect("/admin/uloha?err=" + encodeURIComponent("Neplatný dátum."));
  }

  const admin = createAdminClient();
  const { error } = await admin.from("office_reminders").insert({
    user_id: targetUserId,
    note,
    remind_date: remindDate,
  });

  if (error) {
    console.error("[createTask] insert failed:", error.message);
    redirect(
      "/admin/uloha?err=" +
        encodeURIComponent("DB error: " + error.message),
    );
  }

  redirect("/admin/uloha?ok=1");
}
