import { AuthShell } from "@/components/auth/auth-shell";
import { LogoutClient } from "./logout-client";

export default function LogoutPage() {
  return (
    <AuthShell
      eyebrow="Session"
      title="Signing out of the workspace."
      description="Logout clears the API-owned HttpOnly cookie, then returns you to the login screen."
    >
      <LogoutClient />
    </AuthShell>
  );
}
