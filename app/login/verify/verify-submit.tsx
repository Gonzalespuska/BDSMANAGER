"use client";

import { useFormStatus } from "react-dom";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Submit pre OTP verify formulár — loading state cez useFormStatus().
 */
export function VerifyOtpSubmit() {
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
          Overujem kód…
        </>
      ) : (
        <>
          <KeyRound className="w-4 h-4 mr-2" aria-hidden />
          Prihlásiť sa
        </>
      )}
    </Button>
  );
}
