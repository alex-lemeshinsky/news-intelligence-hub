"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { FormField } from "@/components/auth/form-field";
import { browserApiFetch } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/shared";
import type {
  AuthResponse,
  ResendConfirmationResponse,
} from "@/lib/api/types";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendResult, setResendResult] =
    useState<ResendConfirmationResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await browserApiFetch<AuthResponse>("/auth/login", {
        body: JSON.stringify({ email, password }),
        method: "POST",
      });
      router.replace("/workspace");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Login failed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function resendConfirmation() {
    setError(null);
    setResendResult(null);

    if (!email) {
      setError("Enter your email before requesting a confirmation link.");
      return;
    }

    setResendPending(true);
    try {
      const response = await browserApiFetch<ResendConfirmationResponse>(
        "/auth/resend-confirmation",
        {
          body: JSON.stringify({ email }),
          method: "POST",
        },
      );
      setResendResult(response);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Could not request confirmation.",
      );
    } finally {
      setResendPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Log in</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use a confirmed account to reopen your feeds, article labels, and
          graph workspace.
        </p>
      </div>
      <FormField
        id="login-email"
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <FormField
        id="login-password"
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
      />
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {resendResult ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Confirmation requested</p>
          {resendResult.devConfirmationUrl ? (
            <Link
              className="mt-2 block break-all text-emerald-800 underline underline-offset-2"
              href={resendResult.devConfirmationUrl}
            >
              {resendResult.devConfirmationUrl}
            </Link>
          ) : (
            <p className="mt-2 text-emerald-800">
              Check the configured confirmation channel.
            </p>
          )}
        </div>
      ) : null}
      <button
        className="h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        type="submit"
        disabled={pending}
      >
        {pending ? "Logging in..." : "Log in"}
      </button>
      <button
        className="h-10 w-full rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        type="button"
        onClick={resendConfirmation}
        disabled={resendPending}
      >
        {resendPending ? "Requesting link..." : "Resend confirmation link"}
      </button>
      <p className="text-center text-sm text-slate-600">
        Need an account?{" "}
        <Link className="font-medium text-slate-950 underline" href="/register">
          Register
        </Link>
      </p>
    </form>
  );
}
