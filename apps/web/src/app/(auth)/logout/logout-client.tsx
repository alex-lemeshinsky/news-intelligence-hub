"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserApiFetch } from "@/lib/api/browser";

export function LogoutClient() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function logout() {
      try {
        await browserApiFetch<{ ok: true }>("/auth/logout", {
          method: "POST",
        });
        if (!active) {
          return;
        }
        router.replace("/login");
        router.refresh();
      } catch {
        if (active) {
          setFailed(true);
        }
      }
    }

    void logout();

    return () => {
      active = false;
    };
  }, [router]);

  if (failed) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-950">
          Logout failed
        </h2>
        <p className="text-sm text-slate-600">
          The API did not clear the session. Try again from the workspace.
        </p>
        <Link className="text-sm font-medium text-slate-950 underline" href="/workspace">
          Back to workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-950">Logging out</h2>
      <p className="text-sm text-slate-600">Clearing the auth cookie...</p>
    </div>
  );
}
