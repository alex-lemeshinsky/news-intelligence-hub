import type { ReactNode } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/workspace/logout-button";
import { requireCurrentUser } from "@/lib/auth/session";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await requireCurrentUser();

  return (
    <div className="min-h-screen bg-[#f8faf9] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between md:py-0 lg:px-8">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-slate-700 uppercase">
              News Intelligence Hub
            </p>
            <p className="mt-1 text-xs text-slate-500">{user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex rounded-md border border-slate-200 bg-slate-50 p-1">
              <Link
                className="rounded px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-950"
                href="/workspace"
              >
                Feed
              </Link>
              <Link
                className="rounded px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-950"
                href="/workspace/graph"
              >
                Graph
              </Link>
              <Link
                className="rounded px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-white hover:text-slate-950"
                href="/workspace/settings"
              >
                Settings
              </Link>
            </nav>
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
