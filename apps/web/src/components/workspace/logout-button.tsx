"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserApiFetch } from "@/lib/api/browser";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await browserApiFetch<{ ok: true }>("/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
      type="button"
      onClick={logout}
      disabled={pending}
    >
      {pending ? "Logging out..." : "Log out"}
    </button>
  );
}
