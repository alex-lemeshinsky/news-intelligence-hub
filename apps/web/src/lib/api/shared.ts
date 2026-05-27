import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getPublicApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
    "http://localhost:3001"
  );
}

export function getInternalApiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_BASE_URL?.replace(/\/$/, "") ??
    getPublicApiBaseUrl()
  );
}

export function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME?.trim() || "nih_access_token";
}

export function jsonHeaders(headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has("Content-Type")) {
    mergedHeaders.set("Content-Type", "application/json");
  }
  return mergedHeaders;
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? parseJson(text) : null;

  if (!response.ok) {
    throw new ApiError(readErrorMessage(body), response.status);
  }

  return body as T;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function readErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "Request failed.";
  }

  const errorBody = body as ApiErrorBody;
  if (Array.isArray(errorBody.message)) {
    return errorBody.message.join(" ");
  }

  return errorBody.message ?? errorBody.error ?? "Request failed.";
}
