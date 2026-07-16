import { CallscriptForm } from "../callscript-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function NewCallscriptPage() {
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
      }}
    />
  );
}
