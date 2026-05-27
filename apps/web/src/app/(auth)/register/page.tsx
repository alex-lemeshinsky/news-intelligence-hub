import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/workspace");
  }

  return (
    <AuthShell
      eyebrow="Account setup"
      title="Start with confirmed access, then build your news graph."
      description="Registration stays intentionally simple for review: create an account, use the dev confirmation link, and keep every feed and label scoped to your user."
    >
      <RegisterForm />
    </AuthShell>
  );
}
