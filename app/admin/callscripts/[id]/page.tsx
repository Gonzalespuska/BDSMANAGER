import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { CallscriptForm } from "../callscript-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function EditCallscriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();
  const { data } = await sb
    .from("call_scripts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  return (
    <CallscriptForm
      initial={{
        id: data.id as string,
        label: data.label as string,
        description: (data.description as string | null) ?? null,
        floor_type: (data.floor_type as string | null) ?? null,
        space: (data.space as string | null) ?? null,
        body: (data.body as string) ?? "",
        // JSONB → runtime tvar sa validuje v editore.
        steps: (data.steps as never) ?? null,
        sort_order: (data.sort_order as number) ?? 100,
        active: (data.active as boolean) ?? true,
        target_role:
          data.target_role === "obhliadky" ? "obhliadky" : "obchod",
      }}
    />
  );
}
