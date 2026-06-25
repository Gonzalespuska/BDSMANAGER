"use client";

import * as React from "react";
import { Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  createNoteAction,
  deleteNoteAction,
  updateNoteAction,
  type NotePayload,
} from "./notes-actions";

interface Props {
  initial: NotePayload[];
}

/**
 * Apple-Notes-like panel. Vľavo zoznam, vpravo editor selectnutej.
 * Mobile: prepína sa medzi listom a editorom (back tlačidlo).
 *
 * Autosave: 600ms debounce po každom zmenu title/body.
 */
export function NotesPanel({ initial }: Props) {
  const [notes, setNotes] = React.useState<NotePayload[]>(initial);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initial[0]?.id ?? null,
  );
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setNotes(initial);
    if (!initial.find((n) => n.id === selectedId)) {
      setSelectedId(initial[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => {
      // Pinned first, then by updated_at desc
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });
    if (!q) return sorted;
    return sorted.filter(
      (n) =>
        (n.title?.toLowerCase().includes(q) ?? false) ||
        n.body.toLowerCase().includes(q),
    );
  }, [notes, query]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  async function createNew() {
    if (busy) return;
    setBusy(true);
    const res = await createNoteAction();
    setBusy(false);
    if (!res.ok) {
      alert(`Chyba: ${res.error}`);
      return;
    }
    setNotes((prev) => [res.note, ...prev]);
    setSelectedId(res.note.id);
  }

  return (
    <div className="rounded-2xl border bg-amber-50/40 dark:bg-amber-950/10 overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[480px]">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-amber-100/40 dark:bg-amber-950/20">
        <h2 className="font-extrabold text-base">
          📔 Poznámky{" "}
          <span className="text-muted-foreground font-bold">({notes.length})</span>
        </h2>
        <button
          type="button"
          onClick={createNew}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold bg-foreground text-background hover:bg-foreground/85 transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden />
          Nová
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 sm:grid-cols-[200px_1fr] overflow-hidden">
        {/* Note list */}
        <aside
          className={cn(
            "border-r overflow-hidden flex flex-col bg-amber-50 dark:bg-amber-950/20",
            selected && "hidden sm:flex",
          )}
        >
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search
                className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                placeholder="Hľadaj…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 rounded-md border bg-background text-xs"
              />
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {notes.length === 0
                ? "Zatiaľ žiadne poznámky."
                : `Nič k "${query}".`}
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-amber-200/40">
              {filtered.map((n) => {
                const isSel = n.id === selectedId;
                const preview = (n.body || "").split("\n")[0].slice(0, 60);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(n.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-amber-100/60 transition-colors",
                        isSel && "bg-amber-200/40 hover:bg-amber-200/40",
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {n.pinned && (
                          <Pin
                            className="w-3 h-3 text-amber-600 shrink-0"
                            aria-hidden
                          />
                        )}
                        <span className="font-semibold text-sm truncate">
                          {n.title || "Bez názvu"}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground line-clamp-1">
                        {preview || "Prázdna…"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Editor */}
        <main
          className={cn(
            "overflow-hidden flex flex-col",
            !selected && "hidden sm:flex",
          )}
        >
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              onBack={() => setSelectedId(null)}
              onPatch={(patch) => {
                setNotes((prev) =>
                  prev.map((n) =>
                    n.id === selected.id
                      ? {
                          ...n,
                          ...patch,
                          updated_at: new Date().toISOString(),
                        }
                      : n,
                  ),
                );
              }}
              onDelete={() => {
                setNotes((prev) => prev.filter((n) => n.id !== selected.id));
                setSelectedId(null);
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
              Vyber poznámku zo zoznamu alebo klikni{" "}
              <strong className="ml-1">+ Nová</strong>.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function NoteEditor({
  note,
  onBack,
  onPatch,
  onDelete,
}: {
  note: NotePayload;
  onBack: () => void;
  onPatch: (patch: { title?: string | null; body?: string; pinned?: boolean }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = React.useState(note.title ?? "");
  const [body, setBody] = React.useState(note.body);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    setTitle(note.title ?? "");
    setBody(note.body);
  }, [note.id, note.title, note.body]);

  function schedule(patch: { title?: string | null; body?: string }) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await updateNoteAction(note.id, patch);
      if (res.ok) {
        setSavedAt(new Date());
        onPatch(patch);
      }
    }, 500);
  }

  async function togglePin() {
    const next = !note.pinned;
    const res = await updateNoteAction(note.id, { pinned: next });
    if (res.ok) onPatch({ pinned: next });
  }

  async function remove() {
    if (!confirm("Zmazať poznámku?")) return;
    const res = await deleteNoteAction(note.id);
    if (res.ok) onDelete();
    else alert(`Chyba: ${res.error}`);
  }

  return (
    <>
      <div className="px-4 py-2 border-b bg-amber-100/40 dark:bg-amber-950/20 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="sm:hidden text-xs px-2 py-1 rounded hover:bg-muted"
        >
          ←
        </button>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule({ title: e.target.value });
          }}
          placeholder="Názov poznámky"
          className="flex-1 min-w-0 bg-transparent outline-none font-bold text-sm placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={togglePin}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-amber-600"
          title={note.pinned ? "Odopnúť" : "Pripnúť"}
        >
          {note.pinned ? (
            <Pin className="w-4 h-4 text-amber-600" aria-hidden />
          ) : (
            <PinOff className="w-4 h-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={remove}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Zmazať"
        >
          <Trash2 className="w-4 h-4" aria-hidden />
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          schedule({ body: e.target.value });
        }}
        placeholder="Napíš čokoľvek… (auto-save)"
        className="flex-1 w-full px-4 py-3 bg-transparent outline-none text-sm resize-none font-serif leading-relaxed"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
      />
      <footer className="px-4 py-2 border-t text-[11px] text-muted-foreground bg-amber-50/40 dark:bg-amber-950/10">
        {savedAt
          ? `Uložené ${savedAt.toLocaleTimeString("sk-SK", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}`
          : "Auto-save aktívny"}
      </footer>
    </>
  );
}
