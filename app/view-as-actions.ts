"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getRealUserRole } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";

const VALID_ROLES = ["obchod", "obhliadky", "realizacie", "office"] as const;
type ViewAsRole = (typeof VALID_ROLES)[number];

/**
 * Server Action — admin klikne "Zobraziť ako Obchod" v hornom dropdown.
 * Setne cookie 'view_as_role=obchod' a redirect na dashboard tej role.
 *
 * Bezpečnosť: reálny user MUSÍ byť admin. Kontrolujeme cez getRealUserRole()
 * (bypasses view-as override) — inak by ktokoľvek mohol setnúť si "obchod"
 * a odblokovať niečo. Ale keďže view-as znižuje práva, aj tak by bol OK.
 */
export async function setViewAsRoleAction(role: ViewAsRole) {
  const realRole = await getRealUserRole();
  if (realRole !== "admin") {
    // Neadmini nemôžu view-as (nemá to zmysel, iba by sa zablokovali)
    return;
  }
  if (!VALID_ROLES.includes(role)) {
    return;
  }
  const jar = await cookies();
  jar.set("view_as_role", role, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // Session-only cookie (expires pri zatvorení browsera)
    // maxAge: undefined,
  });

  // Redirect na dashboard tej role. Office rola ešte v type systéme neexistuje,
  // dashboardPathForRole ju nezná — musíme spraviť manuál.
  if (role === "office") {
    redirect("/office");
  } else {
    redirect(dashboardPathForRole(role));
  }
}

/**
 * Server Action — vypne view-as, vráti sa na admin.
 */
export async function clearViewAsRoleAction() {
  const jar = await cookies();
  jar.delete("view_as_role");
  redirect("/admin");
}
