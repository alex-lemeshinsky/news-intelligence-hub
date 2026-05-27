import type { ReactNode } from "react";
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
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-slate-700 uppercase">
              News Intelligence Hub
            </p>
            <p className="mt-1 text-xs text-slate-500">{user.email}</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
