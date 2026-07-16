import { PodkladForm } from "../podklad-form";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function NewPodkladPage() {
  return (
    <PodkladForm
      initial={{
        title: "",
        body_md: "",
        target_role: "vsetci",
        category: "obecne",
        sort_order: 100,
        active: true,
      }}
    />
  );
}
