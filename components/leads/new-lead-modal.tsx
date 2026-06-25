"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Phone, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Manual lead intake form — pre situácie kedy zákazník zavolal priamo,
 * stretol sa na výstave, prišiel cez známeho.
 *
 * Submituje cez webhook s source_id manuálneho zdroja.
 * Po úspechu zatvorí modal + router.refresh() (realtime by tiež broadcasted).
 */
const MANUAL_SOURCE_ID = "55555555-5555-5555-5555-555555555555";

export function NewLeadButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-[0_3px_10px_rgba(2,132,199,0.3)]"
      >
        <Plus className="w-4 h-4 mr-1.5" aria-hidden />
        Manuálny lead
      </Button>
      {open && <NewLeadModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NewLeadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    email: "",
    plocha: "",
    typ_podlahy: "",
    priestor: "",
    lokalita: "",
    message: "",
  });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || (!form.phone.trim() && !form.email.trim())) {
      setError("Meno a aspoň jeden kontakt (telefón alebo email) sú povinné.");
      return;
    }

    setBusy(true);
    try {
      const data: Record<string, string> = {};
      if (form.plocha.trim()) data.plocha = form.plocha.trim();
      if (form.typ_podlahy.trim()) data.typ_podlahy = form.typ_podlahy.trim();
      if (form.priestor.trim()) data.priestor = form.priestor.trim();
      if (form.lokalita.trim()) data.lokalita = form.lokalita.trim();
      if (form.message.trim()) data.message = form.message.trim();

      const res = await fetch(`/api/webhook/lead/${MANUAL_SOURCE_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          source_campaign: "Manuálne pridaný (telefonát / výstava / odporúčanie)",
          data,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Vytváranie zlyhalo");
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neznáma chyba");
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-2xl sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight inline-flex items-center gap-2">
            <Phone className="w-5 h-5 text-sky-600" aria-hidden />
            Manuálny lead (telefonát · výstava · odporúčanie)
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

        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 max-h-[75vh] overflow-y-auto"
        >
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name">Meno *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Janko Mrkvička"
              autoFocus
              required
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefón</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+421 900 123 456"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="janko@example.sk"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Aspoň jeden kontakt (telefón alebo email) je povinný.
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plocha">Plocha (m²)</Label>
              <Input
                id="plocha"
                type="number"
                value={form.plocha}
                onChange={(e) => update("plocha", e.target.value)}
                placeholder="35"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="typ_podlahy">Typ podlahy</Label>
              <select
                id="typ_podlahy"
                value={form.typ_podlahy}
                onChange={(e) => update("typ_podlahy", e.target.value)}
                className="h-10 w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="">— vyber typ —</option>
                <option value="Jednofarebná">Jednofarebná</option>
                <option value="Chipsová">Chipsová</option>
                <option value="Mramorová">Mramorová</option>
                <option value="Metalická">Metalická</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="priestor">Priestor</Label>
              <Input
                id="priestor"
                value={form.priestor}
                onChange={(e) => update("priestor", e.target.value)}
                placeholder="Garáž, Dielňa, Sklad..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lokalita">Lokalita</Label>
              <Input
                id="lokalita"
                value={form.lokalita}
                onChange={(e) => update("lokalita", e.target.value)}
                placeholder="Bratislava"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message">Poznámka z hovoru</Label>
            <textarea
              id="message"
              value={form.message}
              onChange={(e) => update("message", e.target.value)}
              rows={3}
              placeholder="napr. 'Volal priamo, požaduje cenovú ponuku do týždňa.'"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div className="flex gap-2 pt-3 border-t">
            <Button
              type="submit"
              disabled={busy}
              className="flex-1 h-11 bg-sky-600 hover:bg-sky-700"
            >
              {busy ? "Vytváram…" : "Vytvoriť lead"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
              className="h-11"
            >
              Zrušiť
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
