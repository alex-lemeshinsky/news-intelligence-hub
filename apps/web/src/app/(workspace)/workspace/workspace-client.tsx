"use client";

import { FormEvent, useMemo, useState } from "react";
import { browserApiFetch } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/shared";
import type {
  ArticleFeedItem,
  ArticleFeedResponse,
  Category,
  Feed,
  FeedStatus,
} from "@/lib/api/types";

interface WorkspaceClientProps {
  initialArticles: ArticleFeedItem[];
  initialCategories: Category[];
  initialFeeds: Feed[];
}

export function WorkspaceClient({
  initialArticles,
  initialCategories,
  initialFeeds,
}: WorkspaceClientProps) {
  const [articles, setArticles] = useState(initialArticles);
  const [categories] = useState(initialCategories);
  const [feeds, setFeeds] = useState(initialFeeds);
  const [feedUrl, setFeedUrl] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processedCount = useMemo(
    () => articles.filter((article) => article.status === "PROCESSED").length,
    [articles],
  );

  async function refreshWorkspace() {
    const [nextFeeds, nextArticles] = await Promise.all([
      browserApiFetch<Feed[]>("/feeds"),
      browserApiFetch<ArticleFeedResponse>("/articles"),
    ]);
    setFeeds(nextFeeds);
    setArticles(nextArticles.items);
  }

  async function createFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = feedUrl.trim();
    if (!url) {
      return;
    }

    await runAction("feed:create", async () => {
      await browserApiFetch<Feed>("/feeds", {
        body: JSON.stringify({ url }),
        method: "POST",
      });
      setFeedUrl("");
      setNotice("Feed added.");
      await refreshWorkspace();
    });
  }

  async function updateFeedStatus(feed: Feed, status: FeedStatus) {
    await runAction(`feed:${feed.id}:status`, async () => {
      await browserApiFetch<Feed>(`/feeds/${feed.id}`, {
        body: JSON.stringify({ status }),
        method: "PATCH",
      });
      setNotice(status === "PAUSED" ? "Feed paused." : "Feed resumed.");
      await refreshWorkspace();
    });
  }

  async function deleteFeed(feed: Feed) {
    await runAction(`feed:${feed.id}:delete`, async () => {
      await browserApiFetch<Feed>(`/feeds/${feed.id}`, {
        method: "DELETE",
      });
      setNotice("Feed deleted.");
      await refreshWorkspace();
    });
  }

  async function pullFeed(feed: Feed) {
    await runAction(`feed:${feed.id}:pull`, async () => {
      await browserApiFetch<{ id?: string | number }>(`/feeds/${feed.id}/pull`, {
        method: "POST",
      });
      setNotice("Feed pull queued.");
      await refreshWorkspace();
    });
  }

  async function runAction(actionId: string, action: () => Promise<void>) {
    setPendingAction(actionId);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof ApiError
          ? actionError.message
          : "Workspace action failed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">
                Intelligence workspace
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Track sources, processing state, and article labels in one
                tenant-scoped view.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Feeds" value={feeds.length} />
              <Metric label="Articles" value={articles.length} />
              <Metric label="Ready" value={processedCount} />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">Categories</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.length > 0 ? (
              categories.map((category) => (
                <span
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
                  key={category.id}
                >
                  {category.name}
                </span>
              ))
            ) : (
              <p className="text-sm text-slate-500">No categories yet.</p>
            )}
          </div>
        </div>
      </section>

      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">Feeds</h2>
            <span className="text-xs font-medium text-slate-500">
              {feeds.length} total
            </span>
          </div>
          <form className="mt-4 flex gap-2" onSubmit={createFeed}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Feed URL</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                type="url"
                required
                placeholder="https://example.com/rss.xml"
                value={feedUrl}
                onChange={(event) => setFeedUrl(event.currentTarget.value)}
              />
            </label>
            <button
              className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              type="submit"
              disabled={pendingAction === "feed:create"}
            >
              Add
            </button>
          </form>
          <div className="mt-5 space-y-3">
            {feeds.length > 0 ? (
              feeds.map((feed) => (
                <FeedRow
                  feed={feed}
                  key={feed.id}
                  pendingAction={pendingAction}
                  onDelete={deleteFeed}
                  onPull={pullFeed}
                  onStatusChange={updateFeedStatus}
                />
              ))
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                Add a feed to begin collecting articles.
              </p>
            )}
          </div>
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-base font-semibold text-slate-950">
              Article feed
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {articles.length > 0 ? (
              articles.map((article) => (
                <ArticleRow article={article} key={article.id} />
              ))
            ) : (
              <p className="p-5 text-sm text-slate-500">
                No articles have been pulled yet.
              </p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-md border border-slate-200 px-3 py-2">
      <p className="text-lg font-semibold text-slate-950">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function FeedRow({
  feed,
  onDelete,
  onPull,
  onStatusChange,
  pendingAction,
}: {
  feed: Feed;
  onDelete: (feed: Feed) => Promise<void>;
  onPull: (feed: Feed) => Promise<void>;
  onStatusChange: (feed: Feed, status: FeedStatus) => Promise<void>;
  pendingAction: string | null;
}) {
  const title = feed.title ?? feed.url;
  const statusLabel = feed.status.replace("_", " ").toLowerCase();
  const isPaused = feed.status === "PAUSED";

  return (
    <article className="rounded-md border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-950">
            {title}
          </h3>
          <p className="mt-1 truncate text-xs text-slate-500">{feed.url}</p>
        </div>
        <span className={statusClass(feed.status)}>{statusLabel}</span>
      </div>
      {feed.lastError ? (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {feed.lastError}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="h-8 rounded-md bg-slate-950 px-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          type="button"
          disabled={
            feed.status === "PAUSED" || pendingAction === `feed:${feed.id}:pull`
          }
          onClick={() => onPull(feed)}
        >
          {pendingAction === `feed:${feed.id}:pull` ? "Queueing" : "Pull now"}
        </button>
        <button
          className="h-8 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          type="button"
          disabled={pendingAction === `feed:${feed.id}:status`}
          onClick={() =>
            onStatusChange(feed, isPaused ? "ACTIVE" : "PAUSED")
          }
        >
          {isPaused ? "Resume" : "Pause"}
        </button>
        <button
          className="h-8 rounded-md border border-red-200 px-2.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
          type="button"
          disabled={pendingAction === `feed:${feed.id}:delete`}
          onClick={() => onDelete(feed)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function ArticleRow({ article }: { article: ArticleFeedItem }) {
  return (
    <article className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-950">
            {article.title}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {article.sourceTitle ?? "Unknown source"}
            {article.publishedAt ? ` / ${formatDate(article.publishedAt)}` : ""}
          </p>
        </div>
        <span className="w-fit rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
          {article.status.toLowerCase()}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
        {article.summary ?? "Awaiting processing summary."}
      </p>
    </article>
  );
}

function statusClass(status: FeedStatus): string {
  const base = "rounded-md px-2 py-1 text-xs font-medium";
  if (status === "ACTIVE") {
    return `${base} bg-emerald-50 text-emerald-700`;
  }
  if (status === "PULL_ERROR") {
    return `${base} bg-red-50 text-red-700`;
  }
  return `${base} bg-slate-100 text-slate-600`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
