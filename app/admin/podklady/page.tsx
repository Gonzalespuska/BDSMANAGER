import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * /admin/podklady bola stará stránka s call scriptami.
 * User 2026-07-16 pridal interaktívne kroky + placeholder-y — nová
 * stránka je /admin/callscripts. Redirect zachová staré bookmarky.
 */
export default function PodkladyRedirect() {
  redirect("/admin/callscripts");
}
