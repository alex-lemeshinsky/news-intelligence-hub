import {
  getPublicApiBaseUrl,
  jsonHeaders,
  parseApiResponse,
} from "./shared";

export async function browserApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${getPublicApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: jsonHeaders(init.headers),
  });

  return parseApiResponse<T>(response);
}
