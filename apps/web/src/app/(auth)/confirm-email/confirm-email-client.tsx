"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserApiFetch } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/shared";
import type { AuthResponse } from "@/lib/api/types";

interface ConfirmEmailClientProps {
  token: string | null;
}

export function ConfirmEmailClient({ token }: ConfirmEmailClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"pending" | "done" | "failed">(
    token ? "pending" : "failed",
  );
  const [message, setMessage] = useState(
    token ? "Confirming your account..." : "Missing confirmation token.",
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    async function confirmEmail() {
      try {
        await browserApiFetch<AuthResponse>("/auth/confirm-email", {
          body: JSON.stringify({ token }),
          method: "POST",
        });
        if (!active) {
          return;
        }
        setStatus("done");
        setMessage("Email confirmed. Opening your workspace...");
        router.replace("/workspace");
        router.refresh();
      } catch (error) {
        if (!active) {
          return;
        }
        setStatus("failed");
        setMessage(
          error instanceof ApiError
            ? error.message
            : "Email confirmation failed.",
        );
      }
    }

    void confirmEmail();

    return () => {
      active = false;
    };
  }, [router, token]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">
          Email confirmation
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      </div>
      <div
        className={[
          "rounded-md border px-3 py-2 text-sm",
          status === "failed"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-800",
        ].join(" ")}
      >
        {status === "pending"
          ? "Please keep this tab open."
          : status === "done"
            ? "Session created."
            : "Use a fresh dev confirmation link."}
      </div>
      {status === "failed" ? (
        <Link className="text-sm font-medium text-slate-950 underline" href="/login">
          Back to login
        </Link>
      ) : null}
    </div>
  );
}
