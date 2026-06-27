import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Legacy redirect — workload sa presunul do /admin/workload.
 */
export default function LegacyWorkloadRedirect() {
  redirect("/admin/workload");
}
