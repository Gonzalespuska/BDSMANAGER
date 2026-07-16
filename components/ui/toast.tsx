"use client";

import * as React from "react";
import { CheckCircle2, Info, XCircle, Loader2, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal toast systém — bez externých závislostí.
 *
 * API:
 *   toast.success("Lead presunutý do Kontakt");
 *   toast.error("Chyba pri odosielaní CP");
 *   toast.info("PDF stiahnuté");
 *   toast.loading("Odosielam email…"); // manual dismiss ID
 *   toast.dismiss(id);
 *
 * Interne používame Event bus (window CustomEvent) — funguje z akéhokoľvek
 * client komponentu bez prop drilling / Context.
 * <Toaster /> je mount-nutý v AppShell top-of-page a počúva na eventy.
 */

type ToastVariant = "success" | "error" | "info" | "loading";
type ToastItem = {
  id: string;
  variant: ToastVariant;
  message: string;
  timeout?: number; // ms; ignoruje sa pri "loading"
  /** Ak zadané, celý toast je klikateľný — klik navigate. */
  href?: string;
};

const EVENT = "app-toast";

function emit(t: ToastItem) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: t }));
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ToastOpts = { timeout?: number; href?: string };

export const toast = {
  success(message: string, opts?: ToastOpts | number) {
    const id = nextId();
    const o = typeof opts === "number" ? { timeout: opts } : (opts ?? {});
    emit({
      id,
      variant: "success",
      message,
      timeout: o.timeout ?? 3000,
      href: o.href,
    });
    return id;
  },
  error(message: string, opts?: ToastOpts | number) {
    const id = nextId();
    const o = typeof opts === "number" ? { timeout: opts } : (opts ?? {});
    emit({
      id,
      variant: "error",
      message,
      timeout: o.timeout ?? 5000,
      href: o.href,
    });
    return id;
  },
  info(message: string, opts?: ToastOpts | number) {
    const id = nextId();
    const o = typeof opts === "number" ? { timeout: opts } : (opts ?? {});
    emit({
      id,
      variant: "info",
      message,
      timeout: o.timeout ?? 3000,
      href: o.href,
    });
    return id;
  },
  loading(message: string) {
    const id = nextId();
    emit({ id, variant: "loading", message });
    return id;
  },
  dismiss(id: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<string>("app-toast-dismiss", { detail: id }));
  },
};

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    function onAdd(e: Event) {
      const detail = (e as CustomEvent<ToastItem>).detail;
      setItems((prev) => [...prev, detail]);
      if (detail.timeout && detail.variant !== "loading") {
        const t = detail.timeout;
        window.setTimeout(() => {
          setItems((prev) => prev.filter((x) => x.id !== detail.id));
        }, t);
      }
    }
    function onDismiss(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      setItems((prev) => prev.filter((x) => x.id !== id));
    }
    window.addEventListener(EVENT, onAdd);
    window.addEventListener("app-toast-dismiss", onDismiss);
    return () => {
      window.removeEventListener(EVENT, onAdd);
      window.removeEventListener("app-toast-dismiss", onDismiss);
    };
  }, []);

  return (
    <div
      className="fixed top-3 right-3 z-[100] flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifikácie"
    >
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onClose={() => toast.dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: () => void;
}) {
  const meta = {
    success: {
      icon: <CheckCircle2 className="w-4 h-4" aria-hidden />,
      cls: "bg-emerald-50 border-emerald-300 text-emerald-900",
    },
    error: {
      icon: <XCircle className="w-4 h-4" aria-hidden />,
      cls: "bg-rose-50 border-rose-300 text-rose-900",
    },
    info: {
      icon: <Info className="w-4 h-4" aria-hidden />,
      cls: "bg-sky-50 border-sky-300 text-sky-900",
    },
    loading: {
      icon: <Loader2 className="w-4 h-4 animate-spin" aria-hidden />,
      cls: "bg-slate-50 border-slate-300 text-slate-900",
    },
  }[item.variant];
  const clickable = !!item.href && item.variant !== "loading";
  const className = cn(
    "pointer-events-auto min-w-[240px] max-w-sm inline-flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border-2 shadow-lg text-sm font-semibold opacity-100",
    // Pridaný explicit opacity-100 — inak animate-in nechá toast s opacity:0
    // ak sa CSS animácia neaplikuje (napr. reload prerušil animáciu skôr).
    "transition-opacity",
    meta.cls,
    clickable && "cursor-pointer hover:shadow-xl hover:brightness-95 no-underline",
  );
  const inner = (
    <>
      <div className="shrink-0 mt-0.5">{meta.icon}</div>
      <div className="flex-1 min-w-0 leading-snug">{item.message}</div>
      {clickable && (
        <ArrowRight className="w-4 h-4 shrink-0 mt-0.5 opacity-70" aria-hidden />
      )}
      {item.variant !== "loading" && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          className="shrink-0 -mr-1 p-0.5 rounded-md hover:bg-black/10 transition-colors"
          aria-label="Zavrieť notifikáciu"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
    </>
  );
  if (clickable) {
    return (
      <a href={item.href} className={className} role="status">
        {inner}
      </a>
    );
  }
  return (
    <div className={className} role="status">
      {inner}
    </div>
  );
}
