import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmEmailClient } from "./confirm-email-client";

interface ConfirmEmailPageProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function ConfirmEmailPage({
  searchParams,
}: ConfirmEmailPageProps) {
  const params = await searchParams;

  return (
    <AuthShell
      eyebrow="Confirmation"
      title="Confirm once, then continue with a persisted session."
      description="The dev confirmation link activates the account and creates the same secure cookie used by normal login."
    >
      <ConfirmEmailClient token={params.token ?? null} />
    </AuthShell>
  );
}
