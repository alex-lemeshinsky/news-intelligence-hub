import { serverApiFetch } from "@/lib/api/server";
import type {
  ArticleFeedResponse,
  Category,
  Feed,
} from "@/lib/api/types";
import { WorkspaceClient } from "./workspace-client";

export default async function WorkspacePage() {
  const [feeds, categories, articles] = await Promise.all([
    serverApiFetch<Feed[]>("/feeds"),
    serverApiFetch<Category[]>("/categories"),
    serverApiFetch<ArticleFeedResponse>("/articles"),
  ]);

  return (
    <WorkspaceClient
      initialArticles={articles.items}
      initialCategories={categories}
      initialFeeds={feeds}
    />
  );
}
