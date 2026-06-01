import { serverApiFetch } from "@/lib/api/server";
import type { ClassificationAxis, RegenerationRun } from "@/lib/api/types";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [axes, latestRun] = await Promise.all([
    serverApiFetch<ClassificationAxis[]>("/axes"),
    serverApiFetch<RegenerationRun | null>("/axes/regeneration-runs/latest"),
  ]);

  return <SettingsClient initialAxes={axes} initialRun={latestRun} />;
}
