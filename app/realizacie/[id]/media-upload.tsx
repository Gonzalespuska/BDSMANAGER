"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon, Video } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * MediaUpload — client komponent na nahrávanie foto/video do realization-media.
 * Volá /api/realization/upload endpoint ktorý:
 *   1. Autentikuje usera (realizator/obchod/admin)
 *   2. Overí owning (lead patrí mne alebo som ho realizoval)
 *   3. Uploaduje do Supabase Storage
 *   4. Vloží záznam do public.realization_media
 *
 * Podporuje multiple file select + drag/drop + camera capture na mobile.
 */
export function MediaUpload({ leadId }: { leadId: string }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{
    current: number;
    total: number;
    failedNames: string[];
  }>({ current: 0, total: 0, failedNames: [] });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);

    // Client-side validation
    const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
    const invalid = arr.filter(
      (f) =>
        f.size > MAX_SIZE ||
        !(f.type.startsWith("image/") || f.type.startsWith("video/")),
    );
    if (invalid.length > 0) {
      alert(
        `Neplatné súbory (${invalid.length}): iba obrázky/videá do 50 MB.\n\n${invalid.map((f) => f.name).join("\n")}`,
      );
      return;
    }

    setBusy(true);
    setProgress({ current: 0, total: arr.length, failedNames: [] });
    const failed: string[] = [];

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      const fd = new FormData();
      fd.append("lead_id", leadId);
      fd.append("file", file);
      try {
        const res = await fetch("/api/realization/upload", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) failed.push(file.name);
      } catch {
        failed.push(file.name);
      }
      setProgress({ current: i + 1, total: arr.length, failedNames: failed });
    }

    setBusy(false);
    if (failed.length > 0) {
      alert(`❌ Zlyhalo ${failed.length}/${arr.length} súborov:\n${failed.join("\n")}`);
    }
    // Refresh page — načítať nový list médií
    router.refresh();
    if (inputRef.current) inputRef.current.value = "";
    setTimeout(() => setProgress({ current: 0, total: 0, failedNames: [] }), 2000);
  }

  return (
    <section className="rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/40 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold inline-flex items-center gap-2">
            <Upload className="w-5 h-5 text-sky-600" aria-hidden />
            Nahrať foto / video z realizácie
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fotografie stavu pred/počas/po realizácii pošli tu. Obchodník ich uvidí v svojej sekcii "Moje realizácie".
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        capture="environment"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={busy}
        className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-bold file:bg-sky-600 file:text-white hover:file:bg-sky-700 file:cursor-pointer disabled:opacity-50"
      />

      {busy && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-sky-600" aria-hidden />
          <span>
            Nahrávam {progress.current} / {progress.total}…
          </span>
        </div>
      )}
      {!busy && progress.total > 0 && progress.failedNames.length === 0 && (
        <div className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4" aria-hidden />
          Nahraté ({progress.total} súborov)
        </div>
      )}
      {!busy && progress.failedNames.length > 0 && (
        <div className="inline-flex items-center gap-1.5 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4" aria-hidden />
          {progress.failedNames.length} zlyhalo, {progress.total - progress.failedNames.length} OK
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1 border-t border-sky-200">
        <span className="inline-flex items-center gap-1">
          <ImageIcon className="w-3.5 h-3.5" aria-hidden />
          fotky JPG/PNG/HEIC
        </span>
        <span className="inline-flex items-center gap-1">
          <Video className="w-3.5 h-3.5" aria-hidden />
          videá MP4/MOV
        </span>
        <span>max 50 MB / súbor</span>
      </div>
    </section>
  );
}
