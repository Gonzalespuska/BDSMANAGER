"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Submit button s loading state cez useFormStatus().
 * Po klike sa hneď ukáže spinner + "Posielam kód..." kým server action beží.
 */
export function SendOtpSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className={cn(
        "w-full h-11 text-white font-bold shadow-md shadow-sky-500/30 transition-all",
        pending
          ? "bg-sky-600 cursor-wait"
          : "bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700",
      )}
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />
          Posielam kód…
        </>
      ) : (
        <>
          <Mail className="w-4 h-4 mr-2" aria-hidden />
          Pošli mi kód
        </>
      )}
    </Button>
  );
}
