"use client";

import * as React from "react";
import Image from "next/image";
import { Camera, Check, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Štandardný obhliadkarský foto-checklist — obhliadkár musí odfotiť
 * presne definované zábery pre realizátorov (ako pri poisťovacom protokole).
 *
 * Každá položka má:
 *  - Popis čo odfotiť
 *  - required flag
 *  - Uploaded photos zoznam
 *  - Upload button
 *
 * Fotky sa nahrávajú cez /api/lead/media-upload s tag-om `checklist_key`
 * takže vieme ktorý záber je ktorý.
 */
export interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  required: boolean;
  min_photos: number;
}

export const OBHLIADKA_CHECKLIST: ChecklistItem[] = [
  {
    key: "overview",
    label: "Prehľad priestoru",
    description:
      "Celkový záber miestnosti z hlavného vstupu — pre kontext (vidieť rozmery, mobiliár, prekážky).",
    required: true,
    min_photos: 1,
  },
  {
    key: "floor_wide",
    label: "Podlaha — celý pohľad",
    description:
      "Vzdialený záber podlahy (2-3 metre nad zemou), aby bola vidieť celá plocha ktorá sa bude realizovať.",
    required: true,
    min_photos: 2,
  },
  {
    key: "floor_detail",
    label: "Podlaha — detail povrchu",
    description:
      "Close-up (10-20 cm od podlahy) — vidieť textúru, drobné trhliny, zvyšky starej podlahy, škvrny.",
    required: true,
    min_photos: 2,
  },
  {
    key: "cracks",
    label: "Trhliny a defekty",
    description:
      "Každá trhlina/defekt odfotená zvlášť s meracím pásmom pri nej (aby bola vidieť šírka a dĺžka).",
    required: false,
    min_photos: 0,
  },
  {
    key: "edges_corners",
    label: "Rohy a okraje",
    description:
      "Spoje podlahy so stenami vo všetkých 4 rohoch. Podľa toho realizator plánuje krajové úpravy.",
    required: true,
    min_photos: 4,
  },
  {
    key: "damp_spots",
    label: "Miesta s vlhkosťou",
    description:
      "Fľaky, výkvety, tmavé miesta = potenciálna vlhkosť. Ak nič nenájdeš, odfoť aspoň suchú kontrolnú vzorku.",
    required: true,
    min_photos: 1,
  },
  {
    key: "adhesion_meter",
    label: "Odtrhový test — foto meracieho prístroja",
    description:
      "Foto displeja odtrhového testeru s hodnotou v MPa. Zaznamenaj presne to čo si zadal do formulára.",
    required: true,
    min_photos: 1,
  },
  {
    key: "moisture_meter",
    label: "Vlhkomer — foto displeja",
    description:
      "Foto vlhkomeru s hodnotou v %. Ideálne pri MAX nameraní (najhorší bod).",
    required: true,
    min_photos: 1,
  },
  {
    key: "dimensions",
    label: "Rozmery — meracie pásmo",
    description:
      "Foto meracieho pásma pri meraní dĺžky + šírky priestoru. Slúži ako dôkaz na plochu m² v ponuke.",
    required: true,
    min_photos: 2,
  },
  {
    key: "obstacles",
    label: "Prekážky a špeciálne body",
    description:
      "Odvody, kanalizácia, stĺpy, prievozy, dvere. Všetko čo bude realizator musieť obchádzať.",
    required: false,
    min_photos: 0,
  },
];

export interface UploadedMedia {
  id: string;
  url: string;
  checklist_key?: string | null;
}

export function PhotoChecklist({
  leadId,
  media,
  onChange,
}: {
  leadId: string;
  media: UploadedMedia[];
  onChange?: () => void;
}) {
  const [uploading, setUploading] = React.useState<Record<string, boolean>>({});

  async function handleUpload(
    key: string,
    files: FileList | null,
  ): Promise<void> {
    if (!files || files.length === 0) return;
    setUploading((u) => ({ ...u, [key]: true }));
    try {
      for (const f of Array.from(files)) {
        const form = new FormData();
        form.append("file", f);
        form.append("lead_id", leadId);
        form.append("kind", "inspection");
        form.append("checklist_key", key);
        const res = await fetch("/api/inspection/upload", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const err = await res.text().catch(() => "");
          alert(`Chyba uploadu ${f.name}: ${err.slice(0, 200)}`);
        }
      }
      onChange?.();
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-violet-200 bg-violet-50/40 p-3">
        <div className="font-bold text-sm text-violet-900 mb-1">
          📸 Foto-checklist pre obhliadku
        </div>
        <div className="text-xs text-violet-800/80">
          Pre realizátorov potrebujeme presne definované zábery — ako pri
          poisťovacom protokole. Nahraj každú kategóriu zvlášť. Označené{" "}
          <span className="text-rose-700 font-bold">*</span> sú povinné.
        </div>
      </div>

      {OBHLIADKA_CHECKLIST.map((item, idx) => {
        const uploaded = media.filter((m) => m.checklist_key === item.key);
        const done = uploaded.length >= item.min_photos;
        const missing = item.required && !done;
        return (
          <div
            key={item.key}
            className={cn(
              "rounded-xl border-2 p-3 transition-colors",
              missing
                ? "border-rose-300 bg-rose-50/40"
                : done
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-slate-200 bg-white",
            )}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black tabular-nums text-slate-500">
                    {idx + 1}.
                  </span>
                  <span className="font-bold text-sm">
                    {item.label}
                    {item.required && (
                      <span className="text-rose-700 ml-0.5">*</span>
                    )}
                  </span>
                  {done && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                      <Check className="w-3 h-3" />
                      Hotovo ({uploaded.length})
                    </span>
                  )}
                  {missing && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                      Chýba (min {item.min_photos})
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground leading-snug mb-2">
                  {item.description}
                </div>
              </div>
              <label
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-xs font-bold cursor-pointer transition-colors shrink-0",
                  uploading[item.key]
                    ? "border-slate-300 bg-slate-100 text-slate-500 pointer-events-none"
                    : "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100",
                )}
              >
                {uploading[item.key] ? (
                  <>Nahrávam…</>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Nahrať fotku
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => handleUpload(item.key, e.target.files)}
                  disabled={uploading[item.key]}
                />
              </label>
            </div>
            {uploaded.length > 0 && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {uploaded.map((m) => (
                  <div
                    key={m.id}
                    className="relative w-20 h-20 rounded overflow-hidden border-2 border-emerald-300"
                  >
                    <Image
                      src={m.url}
                      alt={item.label}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
