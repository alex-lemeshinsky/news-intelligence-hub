"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { browserApiFetch } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/shared";
import type {
  Category,
  ClassificationAxis,
  RegenerationRun,
} from "@/lib/api/types";

interface SettingsClientProps {
  initialAxes: ClassificationAxis[];
  initialCategories: Category[];
  initialRun: RegenerationRun | null;
}

interface AxisDraft {
  name: string;
  valuesText: string;
}

export function SettingsClient({
  initialAxes,
  initialCategories,
  initialRun,
}: SettingsClientProps) {
  const [axes, setAxes] = useState(initialAxes);
  const [categories, setCategories] = useState(initialCategories);
  const [latestRun, setLatestRun] = useState(initialRun);
  const [drafts, setDrafts] = useState(() => buildDrafts(initialAxes));
  const [categoryDrafts, setCategoryDrafts] = useState(() =>
    buildCategoryDrafts(initialCategories),
  );
  const [newAxis, setNewAxis] = useState<AxisDraft>({
    name: "",
    valuesText: "",
  });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valueCount = useMemo(
    () => axes.reduce((total, axis) => total + axis.values.length, 0),
    [axes],
  );
  const regenerationActive =
    latestRun?.status === "PENDING" || latestRun?.status === "RUNNING";

  async function refreshAxes() {
    const nextAxes = await browserApiFetch<ClassificationAxis[]>("/axes");
    setAxes(nextAxes);
    setDrafts(buildDrafts(nextAxes));
  }

  async function refreshCategories() {
    const nextCategories = await browserApiFetch<Category[]>("/categories");
    setCategories(nextCategories);
    setCategoryDrafts(buildCategoryDrafts(nextCategories));
  }

  async function refreshLatestRun() {
    const run = await browserApiFetch<RegenerationRun | null>(
      "/axes/regeneration-runs/latest",
    );
    setLatestRun(run);
  }

  useEffect(() => {
    if (!regenerationActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshLatestRun();
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [regenerationActive, latestRun?.id]);

  async function createAxis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("axis:create", async () => {
      await browserApiFetch<ClassificationAxis>("/axes", {
        body: JSON.stringify({
          name: newAxis.name,
          values: parseValues(newAxis.valuesText),
        }),
        method: "POST",
      });
      setNewAxis({ name: "", valuesText: "" });
      setNotice("Axis added.");
      await refreshAxes();
    });
  }

  async function updateAxis(axis: ClassificationAxis) {
    const draft = drafts[axis.id];
    if (!draft) {
      return;
    }

    await runAction(`axis:${axis.id}:save`, async () => {
      await browserApiFetch<ClassificationAxis>(`/axes/${axis.id}`, {
        body: JSON.stringify({
          name: draft.name,
          values: parseValues(draft.valuesText),
        }),
        method: "PATCH",
      });
      setNotice("Axis saved.");
      await refreshAxes();
    });
  }

  async function deleteAxis(axis: ClassificationAxis) {
    await runAction(`axis:${axis.id}:delete`, async () => {
      await browserApiFetch<ClassificationAxis>(`/axes/${axis.id}`, {
        method: "DELETE",
      });
      setNotice("Axis deleted.");
      await refreshAxes();
    });
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("category:create", async () => {
      await browserApiFetch<Category>("/categories", {
        body: JSON.stringify({ name: newCategoryName }),
        method: "POST",
      });
      setNewCategoryName("");
      setNotice("Category added.");
      await refreshCategories();
    });
  }

  async function updateCategory(category: Category) {
    const name = categoryDrafts[category.id];
    if (name === undefined) {
      return;
    }

    await runAction(`category:${category.id}:save`, async () => {
      await browserApiFetch<Category>(`/categories/${category.id}`, {
        body: JSON.stringify({ name }),
        method: "PATCH",
      });
      setNotice("Category saved.");
      await refreshCategories();
    });
  }

  async function deleteCategory(category: Category) {
    await runAction(`category:${category.id}:delete`, async () => {
      await browserApiFetch<Category>(`/categories/${category.id}`, {
        method: "DELETE",
      });
      setNotice("Category deleted.");
      await refreshCategories();
    });
  }

  async function startRegeneration() {
    await runAction("regeneration:start", async () => {
      const run = await browserApiFetch<RegenerationRun>(
        "/axes/regeneration-runs",
        {
          method: "POST",
        },
      );
      setLatestRun(run);
      setNotice("Regeneration queued.");
    });
  }

  function updateDraft(axisId: string, patch: Partial<AxisDraft>) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [axisId]: {
        ...currentDrafts[axisId],
        ...patch,
      },
    }));
  }

  function updateCategoryDraft(categoryId: string, name: string) {
    setCategoryDrafts((currentDrafts) => ({
      ...currentDrafts,
      [categoryId]: name,
    }));
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
          : "Settings action failed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-950">
            Axis settings
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Configure the label dimensions used when articles are analyzed.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label="Categories" value={categories.length} />
          <Metric label="Axes" value={axes.length} />
          <Metric label="Values" value={valueCount} />
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Categories
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  User-defined labels used when articles are analyzed.
                </p>
              </div>
              <form className="flex gap-2 lg:min-w-80" onSubmit={createCategory}>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Category name</span>
                  <input
                    className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                    value={newCategoryName}
                    onChange={(event) =>
                      setNewCategoryName(event.currentTarget.value)
                    }
                  />
                </label>
                <button
                  className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={pendingAction === "category:create"}
                  type="submit"
                >
                  {pendingAction === "category:create" ? "Adding" : "Add"}
                </button>
              </form>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {categories.length > 0 ? (
                categories.map((category) => (
                  <CategoryEditor
                    category={category}
                    draftName={categoryDrafts[category.id] ?? category.name}
                    key={category.id}
                    pendingAction={pendingAction}
                    onDelete={deleteCategory}
                    onDraftChange={updateCategoryDraft}
                    onSave={updateCategory}
                  />
                ))
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No categories yet.
                </p>
              )}
            </div>
          </section>
          {axes.length > 0 ? (
            axes.map((axis) => (
              <AxisEditor
                axis={axis}
                draft={drafts[axis.id] ?? draftFromAxis(axis)}
                key={axis.id}
                pendingAction={pendingAction}
                onDelete={deleteAxis}
                onDraftChange={updateDraft}
                onSave={updateAxis}
              />
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
              No axes yet.
            </p>
          )}
        </div>
        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">New axis</h2>
          <form className="mt-4 space-y-4" onSubmit={createAxis}>
            <TextInput
              label="Name"
              value={newAxis.name}
              onChange={(value) =>
                setNewAxis((current) => ({ ...current, name: value }))
              }
            />
            <TextArea
              label="Values"
              value={newAxis.valuesText}
              onChange={(value) =>
                setNewAxis((current) => ({ ...current, valuesText: value }))
              }
            />
            <button
              className="h-10 w-full rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={pendingAction === "axis:create"}
              type="submit"
            >
              {pendingAction === "axis:create" ? "Adding" : "Add axis"}
            </button>
          </form>
          <RegenerationPanel
            latestRun={latestRun}
            pending={pendingAction === "regeneration:start"}
            onStart={startRegeneration}
          />
        </aside>
      </section>
    </main>
  );
}

function AxisEditor({
  axis,
  draft,
  onDelete,
  onDraftChange,
  onSave,
  pendingAction,
}: {
  axis: ClassificationAxis;
  draft: AxisDraft;
  onDelete: (axis: ClassificationAxis) => Promise<void>;
  onDraftChange: (axisId: string, patch: Partial<AxisDraft>) => void;
  onSave: (axis: ClassificationAxis) => Promise<void>;
  pendingAction: string | null;
}) {
  const saving = pendingAction === `axis:${axis.id}:save`;
  const deleting = pendingAction === `axis:${axis.id}:delete`;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <TextInput
          label="Name"
          value={draft.name}
          onChange={(value) => onDraftChange(axis.id, { name: value })}
        />
        <TextArea
          label="Values"
          value={draft.valuesText}
          onChange={(value) => onDraftChange(axis.id, { valuesText: value })}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {axis.values.map((value) => (
            <span
              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
              key={value}
            >
              {value}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            className="h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={saving || deleting}
            type="button"
            onClick={() => onSave(axis)}
          >
            {saving ? "Saving" : "Save"}
          </button>
          <button
            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
            disabled={saving || deleting}
            type="button"
            onClick={() => onDelete(axis)}
          >
            {deleting ? "Deleting" : "Delete"}
          </button>
        </div>
      </div>
    </article>
  );
}

function CategoryEditor({
  category,
  draftName,
  onDelete,
  onDraftChange,
  onSave,
  pendingAction,
}: {
  category: Category;
  draftName: string;
  onDelete: (category: Category) => Promise<void>;
  onDraftChange: (categoryId: string, name: string) => void;
  onSave: (category: Category) => Promise<void>;
  pendingAction: string | null;
}) {
  const saving = pendingAction === `category:${category.id}:save`;
  const deleting = pendingAction === `category:${category.id}:delete`;

  return (
    <article className="rounded-md border border-slate-200 p-3">
      <TextInput
        label="Name"
        value={draftName}
        onChange={(value) => onDraftChange(category.id, value)}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={saving || deleting}
          type="button"
          onClick={() => onSave(category)}
        >
          {saving ? "Saving" : "Save"}
        </button>
        <button
          className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
          disabled={saving || deleting}
          type="button"
          onClick={() => onDelete(category)}
        >
          {deleting ? "Deleting" : "Delete"}
        </button>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 shadow-sm">
      <p className="text-2xl font-semibold leading-none text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function RegenerationPanel({
  latestRun,
  onStart,
  pending,
}: {
  latestRun: RegenerationRun | null;
  onStart: () => Promise<void>;
  pending: boolean;
}) {
  const completed = latestRun
    ? latestRun.processed + latestRun.failed
    : 0;
  const progress =
    latestRun && latestRun.total > 0
      ? Math.round((completed / latestRun.total) * 100)
      : latestRun?.status === "COMPLETED"
        ? 100
        : 0;

  return (
    <section className="mt-6 border-t border-slate-200 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">
          Regeneration
        </h2>
        {latestRun ? (
          <span className={runStatusClass(latestRun.status)}>
            {latestRun.status.toLowerCase()}
          </span>
        ) : null}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <ProgressMetric label="Total" value={latestRun?.total ?? 0} />
        <ProgressMetric label="Done" value={latestRun?.processed ?? 0} />
        <ProgressMetric label="Failed" value={latestRun?.failed ?? 0} />
      </div>
      {latestRun?.error ? (
        <p className="mt-3 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          {latestRun.error}
        </p>
      ) : null}
      <button
        className="mt-4 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        disabled={pending || latestRun?.status === "PENDING" || latestRun?.status === "RUNNING"}
        type="button"
        onClick={() => void onStart()}
      >
        {pending ? "Queueing" : "Regenerate labels"}
      </button>
    </section>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
      <p className="text-base font-semibold leading-none text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <textarea
        className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function buildDrafts(axes: ClassificationAxis[]): Record<string, AxisDraft> {
  return Object.fromEntries(
    axes.map((axis) => [axis.id, draftFromAxis(axis)]),
  );
}

function buildCategoryDrafts(categories: Category[]): Record<string, string> {
  return Object.fromEntries(
    categories.map((category) => [category.id, category.name]),
  );
}

function draftFromAxis(axis: ClassificationAxis): AxisDraft {
  return {
    name: axis.name,
    valuesText: axis.values.join(", "),
  };
}

function parseValues(valuesText: string): string[] {
  return valuesText
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function runStatusClass(status: RegenerationRun["status"]): string {
  const base = "rounded-md px-2 py-1 text-xs font-medium";
  if (status === "COMPLETED") {
    return `${base} bg-emerald-50 text-emerald-700`;
  }
  if (status === "FAILED") {
    return `${base} bg-red-50 text-red-700`;
  }
  if (status === "RUNNING") {
    return `${base} bg-blue-50 text-blue-700`;
  }
  return `${base} bg-slate-100 text-slate-600`;
}
