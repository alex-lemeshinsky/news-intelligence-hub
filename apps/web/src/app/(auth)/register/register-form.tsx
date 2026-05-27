"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { browserApiFetch } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/shared";
import type { RegisterResponse } from "@/lib/api/types";
import { FormField } from "@/components/auth/form-field";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<RegisterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setPending(true);

    try {
      const response = await browserApiFetch<RegisterResponse>(
        "/auth/register",
        {
          body: JSON.stringify({ email, password }),
          method: "POST",
        },
      );
      setResult(response);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Registration failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div>
        <h2 className="text-xl font-semibold text-slate-950">
          Create account
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Add your email and password, then confirm the dev-mode link before
          entering the workspace.
        </p>
      </div>
      <FormField
        id="register-email"
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <FormField
        id="register-password"
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
      />
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {result?.devConfirmationUrl ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Dev confirmation link</p>
          <Link
            className="mt-2 block break-all text-emerald-800 underline underline-offset-2"
            href={result.devConfirmationUrl}
          >
            {result.devConfirmationUrl}
          </Link>
        </div>
      ) : null}
      {result && !result.devConfirmationUrl ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Account created. Check the configured email confirmation channel.
        </p>
      ) : null}
      <button
        className="h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        type="submit"
        disabled={pending}
      >
        {pending ? "Creating account..." : "Register"}
      </button>
      <p className="text-center text-sm text-slate-600">
        Already confirmed?{" "}
        <Link className="font-medium text-slate-950 underline" href="/login">
          Log in
        </Link>
      </p>
    </form>
  );
}
