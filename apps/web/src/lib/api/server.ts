import { cookies } from "next/headers";
import {
  getInternalApiBaseUrl,
  jsonHeaders,
  parseApiResponse,
} from "./shared";

export async function serverApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const headers = jsonHeaders(init.headers);

  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  const response = await fetch(`${getInternalApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers,
  });

  return parseApiResponse<T>(response);
}
