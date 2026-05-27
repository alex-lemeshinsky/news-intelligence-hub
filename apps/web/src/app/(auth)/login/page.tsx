import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/workspace");
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Return to the intelligence workspace."
      description="Confirmed sessions persist in an HttpOnly cookie, so reloads keep the workspace connected without passing user IDs from the browser."
    >
      <LoginForm />
    </AuthShell>
  );
}
