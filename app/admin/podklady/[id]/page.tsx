import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { PodkladForm } from "../podklad-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function EditPodkladPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAdminClient();
  const { data } = await sb
    .from("training_docs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  return (
    <PodkladForm
      initial={{
        id: data.id as string,
        title: data.title as string,
        body_md: (data.body_md as string) ?? "",
        target_role: (data.target_role as
          | "obchod"
          | "obhliadky"
          | "realizacie"
          | "admin"
          | "vsetci") ?? "vsetci",
        category: (data.category as string) ?? "obecne",
        sort_order: (data.sort_order as number) ?? 100,
        active: (data.active as boolean) ?? true,
      }}
    />
  );
}
