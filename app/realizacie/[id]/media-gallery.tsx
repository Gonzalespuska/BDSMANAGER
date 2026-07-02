"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Video, Trash2, Download, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  storage_path: string;
  file_type: string;
  original_filename: string | null;
  caption: string | null;
  uploaded_at: string;
  uploaded_by: string;
}

/**
 * MediaGallery — grid s fotkami/videami z realizácie.
 * Signed URLs sa generujú lazy pri prvom rendere (server pre-fetch cez API).
 */
export function MediaGallery({
  leadId,
  media,
  canDelete,
}: {
  leadId: string;
  media: MediaItem[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [signedUrls, setSignedUrls] = React.useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = React.useState(true);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [lightbox, setLightbox] = React.useState<MediaItem | null>(null);

  // Načítaj signed URLs pre všetky média
  React.useEffect(() => {
    if (media.length === 0) {
      setLoadingUrls(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/realization/media-urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_id: leadId,
            paths: media.map((m) => m.storage_path),
          }),
        });
        const json = (await res.json()) as { urls?: Record<string, string> };
        if (!cancelled) setSignedUrls(json.urls ?? {});
      } catch {
        // silent — fallback na placeholder
      } finally {
        if (!cancelled) setLoadingUrls(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, media]);

  async function handleDelete(item: MediaItem) {
    if (!confirm(`Zmazať ${item.original_filename ?? "súbor"}?`)) return;
    setDeletingId(item.id);
    try {
      const res = await fetch("/api/realization/delete-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_id: item.id }),
      });
      if (!res.ok) {
        alert("Zmazanie zlyhalo.");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  if (media.length === 0) {
    return (
      <div className="rounded-xl border bg-background p-8 text-center text-sm text-muted-foreground">
        Zatiaľ žiadne fotky ani videá. Nahraj cez formulár vyššie.
      </div>
    );
  }

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-2">
          📷 Foto / video ({media.length})
          {loadingUrls && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {media.map((m) => {
            const url = signedUrls[m.storage_path];
            return (
              <div
                key={m.id}
                className="relative rounded-lg border bg-background overflow-hidden group aspect-square"
              >
                <button
                  type="button"
                  onClick={() => setLightbox(m)}
                  className="w-full h-full flex items-center justify-center bg-muted"
                >
                  {url ? (
                    m.file_type === "video" ? (
                      <div className="relative w-full h-full">
                        <video
                          src={url}
                          className="w-full h-full object-cover"
                          preload="metadata"
                        />
                        <Video className="absolute top-1 left-1 w-4 h-4 text-white drop-shadow-lg" aria-hidden />
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt={m.original_filename ?? "foto"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )
                  ) : (
                    <div className="text-muted-foreground">
                      {m.file_type === "video" ? (
                        <Video className="w-8 h-8" aria-hidden />
                      ) : (
                        <ImageIcon className="w-8 h-8" aria-hidden />
                      )}
                    </div>
                  )}
                </button>
                {/* Overlay hover */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex justify-between gap-1">
                    {url && (
                      <a
                        href={url}
                        download={m.original_filename ?? undefined}
                        className="text-white p-1 rounded hover:bg-white/20"
                        title="Stiahnuť"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden />
                      </a>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(m)}
                        disabled={deletingId === m.id}
                        className="text-white p-1 rounded hover:bg-rose-600/50 disabled:opacity-50"
                        title="Zmazať"
                      >
                        {deletingId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Lightbox — full-size preview */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/50 hover:bg-black/80"
            aria-label="Zavrieť"
          >
            ✕
          </button>
          {signedUrls[lightbox.storage_path] ? (
            lightbox.file_type === "video" ? (
              <video
                src={signedUrls[lightbox.storage_path]}
                controls
                className="max-w-full max-h-full"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={signedUrls[lightbox.storage_path]}
                alt={lightbox.original_filename ?? "foto"}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )
          ) : (
            <div className="text-white">Načítavam…</div>
          )}
        </div>
      )}
    </>
  );
}
