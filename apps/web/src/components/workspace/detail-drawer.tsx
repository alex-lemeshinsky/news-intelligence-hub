"use client";

import type { ReactNode } from "react";

interface DetailDrawerProps {
  children: ReactNode;
  error?: string | null;
  loading?: boolean;
  onClose: () => void;
  open: boolean;
  subtitle?: string;
  title: string;
}

export function DetailDrawer({
  children,
  error,
  loading = false,
  onClose,
  open,
  subtitle,
  title,
}: DetailDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close detail drawer"
        className="absolute inset-0 bg-slate-950/30"
        type="button"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl sm:border-l sm:border-slate-200">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-6 text-slate-950">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Loading details.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {!loading && !error ? children : null}
        </div>
      </aside>
    </div>
  );
}
