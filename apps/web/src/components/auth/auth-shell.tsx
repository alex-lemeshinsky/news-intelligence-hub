import Link from "next/link";
import type { ReactNode } from "react";

interface AuthShellProps {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}

export function AuthShell({
  children,
  eyebrow,
  title,
  description,
}: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[#f8faf9] text-slate-950">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[1fr_440px]">
        <section className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-12">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.18em] text-slate-700 uppercase"
          >
            News Intelligence Hub
          </Link>
          <div className="max-w-2xl py-16 lg:py-0">
            <p className="text-sm font-medium text-emerald-700">{eyebrow}</p>
            <h1 className="mt-4 text-4xl leading-tight font-semibold tracking-normal text-slate-950 sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              {description}
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Multi-user news analysis with isolated feeds, labels, and graph
            context.
          </p>
        </section>
        <section className="flex items-center px-6 pb-10 sm:px-10 lg:px-0 lg:pr-12">
          <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
