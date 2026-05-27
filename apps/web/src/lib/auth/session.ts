import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, getAuthCookieName } from "@/lib/api/shared";
import { serverApiFetch } from "@/lib/api/server";
import type { AuthResponse, AuthUser } from "@/lib/api/types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has(getAuthCookieName())) {
    return null;
  }

  try {
    const response = await serverApiFetch<AuthResponse>("/auth/me");
    return response.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function requireCurrentUser(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
