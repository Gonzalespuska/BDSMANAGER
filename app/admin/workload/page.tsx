import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Workload je teraz spojený s Agentmi do /admin/agents.
 */
export default function WorkloadRedirect() {
  redirect("/admin/agents");
}
