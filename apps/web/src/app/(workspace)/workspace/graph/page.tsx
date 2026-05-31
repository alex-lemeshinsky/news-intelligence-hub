import { serverApiFetch } from "@/lib/api/server";
import type { Category, GraphResponse } from "@/lib/api/types";
import { GraphClient } from "./graph-client";

export default async function GraphPage() {
  const [categories, graph] = await Promise.all([
    serverApiFetch<Category[]>("/categories"),
    serverApiFetch<GraphResponse>("/graph"),
  ]);

  return <GraphClient initialCategories={categories} initialGraph={graph} />;
}
