import { serverApiFetch } from "@/lib/api/server";
import type {
  Category,
  ClassificationAxis,
  RegenerationRun,
} from "@/lib/api/types";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [axes, categories, latestRun] = await Promise.all([
    serverApiFetch<ClassificationAxis[]>("/axes"),
    serverApiFetch<Category[]>("/categories"),
    serverApiFetch<RegenerationRun | null>("/axes/regeneration-runs/latest"),
  ]);

  return (
    <SettingsClient
      initialAxes={axes}
      initialCategories={categories}
      initialRun={latestRun}
    />
  );
}
