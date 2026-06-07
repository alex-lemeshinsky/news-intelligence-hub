import { serverApiFetch } from "@/lib/api/server";
import type {
  Category,
  Digest,
  GraphEntityNode,
  GraphResponse,
} from "@/lib/api/types";
import { DigestsClient } from "./digests-client";

export default async function DigestsPage() {
  const [categories, graph, digests] = await Promise.all([
    serverApiFetch<Category[]>("/categories"),
    serverApiFetch<GraphResponse>("/graph?nodeKind=entity"),
    serverApiFetch<Digest[]>("/digests"),
  ]);
  const entities = graph.nodes.filter(
    (node): node is GraphEntityNode => node.kind === "entity",
  );

  return (
    <DigestsClient
      initialCategories={categories}
      initialDigests={digests}
      initialEntities={entities}
    />
  );
}
