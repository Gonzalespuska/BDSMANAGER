"use client";

import * as React from "react";
import { Camera } from "lucide-react";

/**
 * SafePhoto — <img> ktorý sa graceful zbavý ak load zlyhá (broken URL,
 * 404, expired signed token). Miesto broken image ikony ukáže sivý
 * placeholder s kamerou.
 */
export function SafePhoto({ url, alt = "" }: { url: string; alt?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed || !url) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
        <Camera className="w-4 h-4" aria-hidden />
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
