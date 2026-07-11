"use client";

import * as React from "react";
import { Camera } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * SafePhoto — <img> ktorý sa graceful zbavý ak load zlyhá (broken URL,
 * 404, expired signed token). Miesto broken image ikony ukáže sivý
 * placeholder s kamerou. Zdieľané naprieč /obhliadnute, inspection-review,
 * atď. — kdekoľvek zobrazujeme fotky z inspection-media bucket-u.
 */
export function SafePhoto({
  url,
  alt = "",
  className = "w-full h-full object-cover",
  placeholderClassName = "w-full h-full flex items-center justify-center bg-slate-100 text-slate-400",
}: {
  url: string;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  if (failed || !url) {
    return (
      <div className={cn(placeholderClassName)}>
        <Camera className="w-6 h-6" aria-hidden />
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
