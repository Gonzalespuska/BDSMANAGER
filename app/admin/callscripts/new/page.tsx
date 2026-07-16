import { CallscriptForm } from "../callscript-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function NewCallscriptPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const initialRole: "obchod" | "obhliadky" =
    role === "obhliadky" ? "obhliadky" : "obchod";
  return (
    <CallscriptForm
      initial={{
        label: "",
        description: null,
        floor_type: null,
        space: null,
        body: "",
        steps: null,
        sort_order: 100,
        active: true,
        target_role: initialRole,
      }}
    />
  );
}
