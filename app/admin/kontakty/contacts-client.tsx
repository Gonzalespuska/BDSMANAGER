"use client";

import * as React from "react";
import {
  Building2,
  Check,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  UserCircle,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ContactRow {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  category: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Client-side správa kontaktov — pridať / editovať / zmazať cez /api/admin/contacts.
 * Zoskupené podľa firmy (company).
 */
export function ContactsClient({ initial }: { initial: ContactRow[] }) {
  const [contacts, setContacts] = React.useState<ContactRow[]>(initial);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Zoskup podľa company (null = "— bez firmy —")
  const groups = React.useMemo(() => {
    const map = new Map<string, ContactRow[]>();
    for (const c of contacts) {
      const key = c.company?.trim() || "— bez firmy —";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [contacts]);

  async function reload() {
    const r = await fetch("/api/admin/contacts", { cache: "no-store" });
    const json = (await r.json()) as { ok?: boolean; contacts?: ContactRow[] };
    if (json.ok && json.contacts) setContacts(json.contacts);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {contacts.length === 0 ? (
            <>Žiadne kontakty. Klikni „Pridať kontakt" a doplň prvého.</>
          ) : (
            <>
              <span className="font-bold text-foreground">
                {groups.length}
              </span>{" "}
              firma{groups.length === 1 ? "" : groups.length < 5 ? "y" : ""} ·{" "}
              <span className="font-bold text-foreground">
                {contacts.length}
              </span>{" "}
              kontaktov
            </>
          )}
        </div>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="bg-sky-600 hover:bg-sky-700 text-white"
        >
          <Plus className="w-4 h-4 mr-1.5" aria-hidden />
          Pridať kontakt
        </Button>
      </div>

      {/* Groupy */}
      <div className="space-y-3">
        {groups.map(([company, items]) => (
          <section
            key={company}
            className="rounded-2xl border bg-background overflow-hidden"
          >
            <header className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600" aria-hidden />
              <h2 className="font-extrabold text-sm">{company}</h2>
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                {items.length} kontakt{items.length === 1 ? "" : "y"}
              </span>
            </header>
            <ul className="divide-y">
              {items.map((c) =>
                editingId === c.id ? (
                  <ContactEditRow
                    key={c.id}
                    contact={c}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null);
                      reload();
                    }}
                  />
                ) : (
                  <ContactViewRow
                    key={c.id}
                    contact={c}
                    onEdit={() => setEditingId(c.id)}
                    onDeleted={reload}
                  />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>

      {addOpen && (
        <AddContactModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────

function ContactViewRow({
  contact,
  onEdit,
  onDeleted,
}: {
  contact: ContactRow;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function del() {
    if (!confirm(`Zmazať kontakt "${contact.name}"?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/contacts?id=${contact.id}`, {
        method: "DELETE",
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        alert(`Chyba: ${json.error}`);
        return;
      }
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  const isDummy = /dummy/i.test(contact.name);

  return (
    <li className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/30 transition-colors">
      <div
        className={cn(
          "w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 text-xs font-bold",
          isDummy
            ? "bg-amber-100 text-amber-800"
            : "bg-sky-100 text-sky-800",
        )}
      >
        {initials(contact.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="inline-flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">{contact.name}</span>
          {contact.role && (
            <span className="text-[10px] uppercase tracking-wider font-bold bg-sky-100 text-sky-800 border border-sky-200 px-1.5 py-0.5 rounded">
              {contact.role}
            </span>
          )}
          {isDummy && (
            <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
              dummy
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap mt-1 text-[12px] text-muted-foreground">
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1 hover:text-sky-700 tabular-nums"
            >
              <Phone className="w-3 h-3" aria-hidden />
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1 hover:text-sky-700 truncate max-w-[200px]"
            >
              <Mail className="w-3 h-3" aria-hidden />
              {contact.email}
            </a>
          )}
          {!contact.phone && !contact.email && (
            <span className="italic">— žiadne kontaktné údaje —</span>
          )}
        </div>
        {contact.notes && (
          <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-start gap-1">
            <StickyNote className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
            <span>{contact.notes}</span>
          </div>
        )}
      </div>
      <div className="inline-flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-muted"
          title="Upraviť"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={del}
          disabled={busy}
          className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-rose-100 text-rose-700 disabled:opacity-50"
          title="Zmazať"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
          )}
        </button>
      </div>
    </li>
  );
}

function ContactEditRow({
  contact,
  onCancel,
  onSaved,
}: {
  contact: ContactRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({
    name: contact.name,
    company: contact.company ?? "",
    role: contact.role ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    notes: contact.notes ?? "",
  });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contact.id, ...form }),
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        alert(`Chyba: ${json.error}`);
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3 bg-sky-50/30">
      <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
        <FieldRow label="Meno">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </FieldRow>
        <FieldRow label="Firma">
          <Input
            value={form.company}
            onChange={(e) =>
              setForm((f) => ({ ...f, company: e.target.value }))
            }
          />
        </FieldRow>
        <FieldRow label="Rola / pozícia">
          <Input
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            placeholder="napr. Obchodný zástupca"
          />
        </FieldRow>
        <FieldRow label="Telefón">
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) =>
              setForm((f) => ({ ...f, phone: e.target.value }))
            }
            placeholder="+421 …"
          />
        </FieldRow>
        <FieldRow label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm((f) => ({ ...f, email: e.target.value }))
            }
            placeholder="meno@firma.sk"
          />
        </FieldRow>
        <FieldRow label="Poznámka" className="md:col-span-2">
          <Input
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
            placeholder="krátka poznámka o vzťahu, čo rieši, atď."
          />
        </FieldRow>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          onClick={save}
          disabled={busy || !form.name.trim()}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden />
          ) : (
            <Check className="w-4 h-4 mr-1.5" aria-hidden />
          )}
          Uložiť
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="outline"
          disabled={busy}
        >
          <X className="w-4 h-4 mr-1.5" aria-hidden />
          Zrušiť
        </Button>
      </div>
    </li>
  );
}

function AddContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({
    name: "",
    company: "",
    role: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/admin/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await r.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        alert(`Chyba: ${json.error}`);
        return;
      }
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-base font-bold inline-flex items-center gap-2">
            <UserCircle className="w-5 h-5 text-sky-600" aria-hidden />
            Pridať kontakt
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-muted"
            aria-label="Zavrieť"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>

        <form onSubmit={save} className="p-5 space-y-3">
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            <FieldRow label="Meno *">
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Peter Noga"
                required
                autoFocus
              />
            </FieldRow>
            <FieldRow label="Firma">
              <Input
                value={form.company}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company: e.target.value }))
                }
                placeholder="Sika"
              />
            </FieldRow>
            <FieldRow label="Rola / pozícia">
              <Input
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value }))
                }
                placeholder="Obchodný zástupca"
              />
            </FieldRow>
            <FieldRow label="Telefón">
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
                placeholder="+421 …"
              />
            </FieldRow>
            <FieldRow label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="meno@firma.sk"
              />
            </FieldRow>
            <FieldRow label="Poznámka" className="md:col-span-2">
              <Input
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Krátky popis vzťahu"
              />
            </FieldRow>
          </div>

          <div className="flex gap-2 pt-3 border-t">
            <Button
              type="submit"
              disabled={busy || !form.name.trim()}
              className="flex-1 bg-sky-600 hover:bg-sky-700"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="w-4 h-4 mr-1.5" aria-hidden />
              )}
              Uložiť kontakt
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Zrušiť
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function initials(s: string): string {
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
