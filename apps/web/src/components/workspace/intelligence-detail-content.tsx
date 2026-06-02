"use client";

import type { ReactNode } from "react";
import type {
  ArticleDetail,
  ArticleImportance,
  ArticleProcessingStatus,
  EntityDetail,
} from "@/lib/api/types";

interface DetailContentProps {
  onOpenArticle: (articleLabelId: string) => Promise<void>;
  onOpenEntity: (entityId: string) => Promise<void>;
}

export function ArticleDetailContent({
  detail,
  onOpenArticle,
  onOpenEntity,
}: DetailContentProps & {
  detail: ArticleDetail;
}) {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-medium text-slate-500">
          {detail.sourceTitle ?? "Unknown source"}
          {detail.publishedAt ? ` / ${formatDate(detail.publishedAt)}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={articleStatusClass(detail.status)}>
            {statusLabel(detail)}
          </span>
          {detail.importance ? (
            <span className={importanceClass(detail.importance)}>
              {detail.importance.toLowerCase()}
            </span>
          ) : null}
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-700">
          {detail.summary ??
            detail.preFilterReason ??
            "No analysis summary is available yet."}
        </p>
        <a
          className="mt-3 inline-flex text-sm font-semibold text-slate-900 underline underline-offset-2"
          href={detail.originalUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open original article
        </a>
      </section>

      <DetailSection title="Entities">
        {detail.entities.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {detail.entities.map((entity) => (
              <button
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                key={entity.id}
                type="button"
                onClick={() => void onOpenEntity(entity.id)}
              >
                {entity.name} · {entity.type.toLowerCase()}
              </button>
            ))}
          </div>
        ) : (
          <EmptyDetailText>No entities were extracted.</EmptyDetailText>
        )}
      </DetailSection>

      <DetailSection title="Labels">
        <div className="flex flex-wrap gap-2">
          {detail.categories.map((category) => (
            <span
              className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
              key={category.id}
            >
              {category.name}
            </span>
          ))}
          {detail.axes.map((axis) => (
            <span
              className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
              key={axis.axisId}
            >
              {axis.axisName}: {axis.value}
            </span>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Duplicate sources">
        {detail.duplicateSources.length > 0 ? (
          <div className="space-y-2">
            {detail.duplicateSources.map((source) => (
              <a
                className="block rounded-md border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50"
                href={source.originalUrl}
                key={`${source.feedId}:${source.originalUrl}`}
                rel="noreferrer"
                target="_blank"
              >
                <span className="font-semibold text-slate-900">
                  {source.sourceTitle}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Pulled {formatDate(source.pulledAt)}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <EmptyDetailText>No duplicate source records.</EmptyDetailText>
        )}
      </DetailSection>

      <DetailSection title="Similar articles">
        {detail.similarArticles.length > 0 ? (
          <div className="space-y-2">
            {detail.similarArticles.map((article) => (
              <button
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm transition hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
                disabled={!article.articleLabelId}
                key={article.similarityId}
                type="button"
                onClick={() =>
                  article.articleLabelId
                    ? void onOpenArticle(article.articleLabelId)
                    : undefined
                }
              >
                <span className="font-semibold text-slate-900">
                  {article.title}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {article.kind.toLowerCase()}
                  {article.score === null ? "" : ` / score ${article.score}`}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyDetailText>No similar articles are linked.</EmptyDetailText>
        )}
      </DetailSection>
    </div>
  );
}

export function EntityDetailContent({
  detail,
  onOpenArticle,
  onOpenEntity,
}: DetailContentProps & {
  detail: EntityDetail;
}) {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-medium text-slate-500">
          {detail.entityType.toLowerCase()}
        </p>
        {detail.description ? (
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {detail.description}
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <DetailMetric label="Articles" value={detail.articleCount} />
          <DetailMetric label="Aliases" value={detail.aliases.length} />
          <DetailMetric
            label="Related"
            value={detail.relatedEntities.length}
          />
        </dl>
      </section>

      <DetailSection title="Aliases">
        {detail.aliases.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {detail.aliases.map((alias) => (
              <span
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
                key={alias}
              >
                {alias}
              </span>
            ))}
          </div>
        ) : (
          <EmptyDetailText>No aliases recorded.</EmptyDetailText>
        )}
      </DetailSection>

      <DetailSection title="Mention activity">
        {detail.mentionActivity.length > 0 ? (
          <div className="space-y-2">
            {detail.mentionActivity.map((bucket) => (
              <div
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                key={bucket.date}
              >
                <span className="font-medium text-slate-700">
                  {bucket.date}
                </span>
                <span className="font-semibold text-slate-950">
                  {bucket.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyDetailText>No dated mentions yet.</EmptyDetailText>
        )}
      </DetailSection>

      <DetailSection title="Related entities">
        {detail.relatedEntities.length > 0 ? (
          <div className="space-y-2">
            {detail.relatedEntities.map((entity) => (
              <button
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
                key={entity.entityId}
                type="button"
                onClick={() => void onOpenEntity(entity.entityId)}
              >
                <span className="font-semibold text-slate-900">
                  {entity.label}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {entity.entityType.toLowerCase()} / {entity.weight} mentions
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyDetailText>No related entities yet.</EmptyDetailText>
        )}
      </DetailSection>

      <DetailSection title="Mentioning articles">
        {detail.mentioningArticles.length > 0 ? (
          <div className="space-y-2">
            {detail.mentioningArticles.map((article) => (
              <button
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
                key={article.articleLabelId}
                type="button"
                onClick={() => void onOpenArticle(article.articleLabelId)}
              >
                <span className="font-semibold text-slate-900">
                  {article.title}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {article.publishedAt
                    ? formatDate(article.publishedAt)
                    : "No date"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyDetailText>No mentioning articles yet.</EmptyDetailText>
        )}
      </DetailSection>
    </div>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DetailMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function EmptyDetailText({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-slate-500">{children}</p>;
}

function articleStatusClass(status: ArticleProcessingStatus): string {
  const base = "rounded-md px-2 py-1 text-xs font-medium";
  if (status === "PROCESSED") {
    return `${base} bg-emerald-50 text-emerald-700`;
  }
  if (status === "FILTERED") {
    return `${base} bg-amber-50 text-amber-700`;
  }
  if (status === "FAILED") {
    return `${base} bg-red-50 text-red-700`;
  }
  return `${base} bg-slate-100 text-slate-600`;
}

function statusLabel(article: {
  preFilterReason: string | null;
  status: ArticleProcessingStatus;
}): string {
  if (article.status === "FILTERED") {
    return "filtered before LLM";
  }
  return article.status.toLowerCase();
}

function importanceClass(importance: ArticleImportance): string {
  const base = "rounded-md px-2 py-1 text-xs font-medium";
  if (importance === "HIGH") {
    return `${base} bg-blue-50 text-blue-700`;
  }
  if (importance === "JUNK") {
    return `${base} bg-amber-50 text-amber-700`;
  }
  return `${base} bg-slate-100 text-slate-600`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
