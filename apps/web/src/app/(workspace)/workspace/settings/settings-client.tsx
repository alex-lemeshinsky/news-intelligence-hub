"use client";

import { FormEvent, useMemo, useState } from "react";
import { browserApiFetch } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/shared";
import type { ClassificationAxis } from "@/lib/api/types";

interface SettingsClientProps {
  initialAxes: ClassificationAxis[];
}

interface AxisDraft {
  name: string;
  valuesText: string;
}

export function SettingsClient({ initialAxes }: SettingsClientProps) {
  const [axes, setAxes] = useState(initialAxes);
  const [drafts, setDrafts] = useState(() => buildDrafts(initialAxes));
  const [newAxis, setNewAxis] = useState<AxisDraft>({
    name: "",
    valuesText: "",
  });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valueCount = useMemo(
    () => axes.reduce((total, axis) => total + axis.values.length, 0),
    [axes],
  );

  async function refreshAxes() {
    const nextAxes = await browserApiFetch<ClassificationAxis[]>("/axes");
    setAxes(nextAxes);
    setDrafts(buildDrafts(nextAxes));
  }

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

  function updateDraft(axisId: string, patch: Partial<AxisDraft>) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [axisId]: {
        ...currentDrafts[axisId],
        ...patch,
      },
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
        <div className="grid grid-cols-2 gap-2 text-center">
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
