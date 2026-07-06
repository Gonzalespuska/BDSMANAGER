import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * DEPRECATED — merged into /admin/prehlad.
 * Ostáva pre backward-compat starých bookmark-ov / linkov v e-mailoch.
 */
export default function LeadsAnalytikaRedirect() {
  redirect("/admin/prehlad");
}
