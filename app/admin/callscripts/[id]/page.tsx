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
        steps: (data.steps as Array<{
          id: string;
          type: "info" | "choice" | "yesno" | "number" | "freetext";
          prompt: string;
          options?: Array<{ value: string; label: string }>;
          allow_other?: boolean;
          unit?: string;
          required?: boolean;
        }> | null) ?? null,
        sort_order: (data.sort_order as number) ?? 100,
        active: (data.active as boolean) ?? true,
      }}
    />
  );
}
