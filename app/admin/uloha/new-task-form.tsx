"use client";

import * as React from "react";
import { createTaskAction } from "./actions";

interface UserOpt {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export function NewTaskForm({ users }: { users: UserOpt[] }) {
  const [pending, setPending] = React.useState(false);

  // Default: dnes
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={async (fd) => {
        setPending(true);
        try {
          await createTaskAction(fd);
        } finally {
          setPending(false);
        }
      }}
      className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-4 space-y-3"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pre koho *
          </span>
          <select
            name="user_id"
            required
            className="rounded-lg border-2 bg-background px-3 py-2 text-sm font-semibold focus:border-sky-500 focus:outline-none"
            defaultValue=""
          >
            <option value="" disabled>
              — vyber človeka —
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email} · {u.role}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Kedy pripomenúť *
          </span>
          <input
            type="date"
            name="remind_date"
            required
            defaultValue={today}
            className="rounded-lg border-2 bg-background px-3 py-2 text-sm font-semibold focus:border-sky-500 focus:outline-none"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Čo má spraviť * <span className="text-[10px] font-normal">(max 500 znakov)</span>
        </span>
        <textarea
          name="note"
          required
          maxLength={500}
          rows={3}
          placeholder="napr. Zavolať Petrovi Kováčovi späť ohľadom faktúry"
          className="rounded-lg border-2 bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none resize-none"
        />
      </label>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-bold transition-colors inline-flex items-center gap-1.5"
        >
          {pending ? "Ukladám…" : "🔔 Priradiť úlohu"}
        </button>
      </div>
    </form>
  );
}
