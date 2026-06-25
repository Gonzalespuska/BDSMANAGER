"use client";

import * as React from "react";
import { Check, Pencil, StickyNote, Trash2, X } from "lucide-react";

import { saveLeadNoteAction } from "@/app/agent/actions";
import { cn } from "@/lib/utils";

/**
 * Inline poznámka na lead karte.
 *
 * Zobrazenie:
 *   - Bez poznámky: tlačidlo "+ Pridať poznámku"
 *   - S poznámkou: žltý sticky-note box + pencil ikona na úpravu
 *   - V edit móde: textarea + Save / Cancel
 *
 * Ukladá sa do `lead.data.agent_note` cez server action.
 */
export function LeadNotesInline({
  leadId,
  initialNote,
}: {
  leadId: string;
  initialNote: string;
}) {
  const [note, setNote] = React.useState(initialNote);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(initialNote);
  const [busy, setBusy] = React.useState(false);

  async function handleSave() {
    setBusy(true);
    const result = await saveLeadNoteAction(leadId, draft);
    if (result.ok) {
      setNote(draft.trim());
      setEditing(false);
    } else {
      alert(`Chyba: ${result.error}`);
    }
    setBusy(false);
  }

  async function handleDelete() {
    if (!confirm("Naozaj vymazať poznámku?")) return;
    setBusy(true);
    const result = await saveLeadNoteAction(leadId, "");
    if (result.ok) {
      setNote("");
      setDraft("");
      setEditing(false);
    } else {
      alert(`Chyba: ${result.error}`);
    }
    setBusy(false);
  }

  function handleCancel() {
    setDraft(note);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 mb-1.5">
          <StickyNote className="w-3 h-3" aria-hidden />
          Poznámka
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={2}
          placeholder="napr. 'chce ponuku do piatka, volať po 17h'"
          className="w-full px-2 py-1.5 rounded-md border border-amber-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors",
              busy && "opacity-50",
            )}
          >
            <Check className="w-3.5 h-3.5" aria-hidden />
            {busy ? "Ukladám…" : "Uložiť"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
            Zrušiť
          </button>
          {note && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-white hover:bg-red-50 border border-red-300 text-red-700 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              Vymazať
            </button>
          )}
          <span className="text-[10px] text-amber-700 ml-auto">
            ⌘ + Enter pre uloženie
          </span>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 hover:bg-amber-50 px-2.5 py-1.5 rounded-md transition-colors border border-dashed border-amber-300"
      >
        <StickyNote className="w-3.5 h-3.5" aria-hidden />
        + Pridať poznámku
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 group relative">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 mb-1">
            <StickyNote className="w-3 h-3" aria-hidden />
            Poznámka
          </div>
          <p className="text-sm text-amber-900 whitespace-pre-wrap leading-snug">
            {note}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 p-1 rounded hover:bg-amber-200 text-amber-700"
          aria-label="Upraviť poznámku"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
