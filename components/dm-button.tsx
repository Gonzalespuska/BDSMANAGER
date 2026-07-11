"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

/**
 * Tlačidlo „💬 Napísať" — otvorí (alebo vytvorí) DM roomku s peer-om
 * a naviguje na /agent/team?room=<id>.
 *
 * Použitie:
 *   <DmButton peerId={obchodnikId} peerName="Mário Vitáz" />
 */
export function DmButton({
  peerId,
  peerName,
  className,
  prefill,
}: {
  peerId: string;
  peerName: string;
  className?: string;
  /** Voliteľne pre-fill textarea keď sa otvorí konverzácia. User: "ked
   * uz pises tak tam musi byt referencia ze stlacim a napise spravu
   * ahoj pisem ti ohladom obhliadky... a potom uz manualne napsies". */
  prefill?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/chat/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer_id: peerId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        room_id?: string;
        is_new?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.room_id) {
        toast.error(`Chyba: ${json.error ?? `HTTP ${res.status}`}`);
        return;
      }
      if (json.is_new) {
        toast.success(`Nová konverzácia s ${peerName}`);
      }
      // Naviguj na /dm/[roomId] — voliteľne s prefill query param
      const url = prefill
        ? `/dm/${json.room_id}?prefill=${encodeURIComponent(prefill)}`
        : `/dm/${json.room_id}`;
      router.push(url);
    } catch (e) {
      toast.error(`Chyba siete: ${e instanceof Error ? e.message : "neznáma"}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border-2 border-sky-200 bg-sky-50 hover:bg-sky-100 hover:border-sky-300 text-sky-900 px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      aria-label={`Napísať súkromnú správu — ${peerName}`}
      title={`Napísať súkromnú správu — ${peerName}`}
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
      ) : (
        <MessageCircle className="w-3.5 h-3.5" aria-hidden />
      )}
      Napísať
    </button>
  );
}
