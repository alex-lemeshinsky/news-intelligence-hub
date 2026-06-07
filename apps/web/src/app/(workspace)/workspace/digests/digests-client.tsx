"use client";

import { FormEvent, useMemo, useState } from "react";
import { browserApiFetch } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/shared";
import type {
  Category,
  Digest,
  DigestPeriod,
  DigestStatus,
  GraphEntityNode,
} from "@/lib/api/types";

interface DigestsClientProps {
  initialCategories: Category[];
  initialDigests: Digest[];
  initialEntities: GraphEntityNode[];
}

const PERIOD_OPTIONS: Array<{ label: string; value: DigestPeriod }> = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

export function DigestsClient({
  initialCategories,
  initialDigests,
  initialEntities,
}: DigestsClientProps) {
  const [categories] = useState(initialCategories);
  const [digests, setDigests] = useState(initialDigests);
  const [entities] = useState(initialEntities);
  const [period, setPeriod] = useState<DigestPeriod>("week");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeCount = useMemo(
    () =>
      digests.filter(
        (digest) =>
          digest.status === "PENDING" || digest.status === "RUNNING",
      ).length,
    [digests],
  );
  const completedCount = useMemo(
    () => digests.filter((digest) => digest.status === "COMPLETED").length,
    [digests],
  );

  async function refreshDigests() {
    setDigests(await browserApiFetch<Digest[]>("/digests"));
  }

  async function submitDigest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      await browserApiFetch<Digest>("/digests", {
        body: JSON.stringify({
          categoryIds: selectedCategoryIds,
          entityIds: selectedEntityIds,
          period,
        }),
        method: "POST",
      });
      setNotice("Digest queued.");
      await refreshDigests();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Digest request failed.",
      );
    } finally {
      setPending(false);
    }
  }

  function toggleSelection(
    selectedIds: string[],
    setSelectedIds: (ids: string[]) => void,
    id: string,
  ) {
    setSelectedIds(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">
                Period digests
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Generate scoped summaries from processed articles and entity
                activity.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Total" value={digests.length} />
              <Metric label="Active" value={activeCount} />
              <Metric label="Done" value={completedCount} />
            </div>
          </div>
        </div>

        <form
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          onSubmit={submitDigest}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">
              New digest
            </h2>
            <button
              className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={pending}
              type="submit"
            >
              {pending ? "Queueing" : "Generate"}
            </button>
          </div>

          <label className="mt-4 block text-xs font-medium text-slate-600">
            Period
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-500"
              onChange={(event) =>
                setPeriod(event.target.value as DigestPeriod)
              }
              value={period}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <ScopeChecklist
            label="Categories"
            options={categories.map((category) => ({
              id: category.id,
              label: category.name,
            }))}
            selectedIds={selectedCategoryIds}
            toggle={(id) =>
              toggleSelection(
                selectedCategoryIds,
                setSelectedCategoryIds,
                id,
              )
            }
          />
          <ScopeChecklist
            label="Entities"
            options={entities.map((entity) => ({
              id: entity.entityId,
              label: entity.label,
            }))}
            selectedIds={selectedEntityIds}
            toggle={(id) =>
              toggleSelection(selectedEntityIds, setSelectedEntityIds, id)
            }
          />
        </form>
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

      <section className="grid gap-4">
        {digests.length > 0 ? (
          digests.map((digest) => (
            <DigestCard
              categories={categories}
              digest={digest}
              entities={entities}
              key={digest.id}
            />
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">
              No digests yet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Queued digest results will appear here.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function ScopeChecklist({
  label,
  options,
  selectedIds,
  toggle,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  selectedIds: string[];
  toggle: (id: string) => void;
}) {
  return (
    <fieldset className="mt-5">
      <legend className="text-xs font-semibold text-slate-600 uppercase">
        {label}
      </legend>
      <div className="mt-2 grid max-h-44 gap-2 overflow-auto rounded-md border border-slate-200 p-2">
        {options.length > 0 ? (
          options.map((option) => (
            <label
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              key={option.id}
            >
              <input
                checked={selectedIds.includes(option.id)}
                className="size-4 rounded border-slate-300"
                onChange={() => toggle(option.id)}
                type="checkbox"
              />
              <span>{option.label}</span>
            </label>
          ))
        ) : (
          <p className="px-2 py-1.5 text-sm text-slate-500">No options.</p>
        )}
      </div>
    </fieldset>
  );
}

function DigestCard({
  categories,
  digest,
  entities,
}: {
  categories: Category[];
  digest: Digest;
  entities: GraphEntityNode[];
}) {
  const categoryNames = digest.scope.categoryIds
    .map((categoryId) => categories.find((category) => category.id === categoryId))
    .filter((category): category is Category => Boolean(category))
    .map((category) => category.name);
  const entityNames = digest.scope.entityIds
    .map((entityId) => entities.find((entity) => entity.entityId === entityId))
    .filter((entity): entity is GraphEntityNode => Boolean(entity))
    .map((entity) => entity.label);
  const scopeChips = [
    ...categoryNames.map((label) => ({
      key: `category:${label}`,
      label,
    })),
    ...entityNames.map((label) => ({
      key: `entity:${label}`,
      label,
    })),
  ];

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">
              {periodLabel(digest.period)} digest
            </h2>
            <StatusPill status={digest.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(digest.periodStart)} to {formatDate(digest.periodEnd)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {scopeChips.length > 0 ? (
              scopeChips.map((chip) => (
                <span
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600"
                  key={chip.key}
                >
                  {chip.label}
                </span>
              ))
            ) : (
              <span className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
                All processed intelligence
              </span>
            )}
          </div>
        </div>
        <p className="text-xs font-medium text-slate-500">
          Requested {formatDate(digest.createdAt)}
        </p>
      </div>

      {digest.error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {digest.error}
        </p>
      ) : null}

      {digest.overview ? (
        <p className="mt-4 text-sm leading-6 text-slate-700">
          {digest.overview}
        </p>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          Background processing has not produced an overview yet.
        </p>
      )}

      {digest.facts ? <DigestFactsView digest={digest} /> : null}
    </article>
  );
}

function DigestFactsView({ digest }: { digest: Digest }) {
  const facts = digest.facts;
  if (!facts) {
    return null;
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      <FactColumn
        emptyLabel="No categories"
        label="Top categories"
        rows={facts.topCategories.map((category) => ({
          detail: `${category.count} articles`,
          id: category.categoryId,
          label: category.name,
        }))}
      />
      <FactColumn
        emptyLabel="No entities"
        label="Top entities"
        rows={facts.topEntities.map((entity) => ({
          detail: `${entity.count} mentions`,
          id: entity.entityId,
          label: entity.name,
        }))}
      />
      <FactColumn
        emptyLabel="No articles"
        label="Key articles"
        rows={facts.keyArticles.map((article) => ({
          detail: article.publishedAt
            ? formatDate(article.publishedAt)
            : "No date",
          id: article.articleLabelId,
          label: article.title,
        }))}
      />
    </div>
  );
}

function FactColumn({
  emptyLabel,
  label,
  rows,
}: {
  emptyLabel: string;
  label: string;
  rows: Array<{
    detail: string;
    id: string;
    label: string;
  }>;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase">
        {label}
      </h3>
      <div className="mt-2 grid gap-2">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div
              className="rounded-md border border-slate-200 px-3 py-2"
              key={row.id}
            >
              <p className="text-sm font-medium text-slate-800">{row.label}</p>
              <p className="mt-1 text-xs text-slate-500">{row.detail}</p>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
            {emptyLabel}
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-lg font-semibold leading-none text-slate-950">
        {formatNumber(value)}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: DigestStatus }) {
  const className =
    status === "COMPLETED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "FAILED"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span
      className={`rounded-md border px-2 py-1 text-xs font-semibold ${className}`}
    >
      {labelFromEnum(status)}
    </span>
  );
}

function periodLabel(period: DigestPeriod): string {
  return PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? period;
}

function labelFromEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
