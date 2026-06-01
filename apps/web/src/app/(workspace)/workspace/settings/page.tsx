import { serverApiFetch } from "@/lib/api/server";
import type { ClassificationAxis } from "@/lib/api/types";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const axes = await serverApiFetch<ClassificationAxis[]>("/axes");

  return <SettingsClient initialAxes={axes} />;
}
