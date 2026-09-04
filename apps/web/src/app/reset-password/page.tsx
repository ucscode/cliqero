import { PasswordResetForm } from "@/components/password-reset-form";
import { AuthShell } from "@/components/auth-shell";

export default async function ResetPasswordQueryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  if (!token)
    return (
      <AuthShell
        eyebrow="Account security"
        title="Reset link unavailable"
        description="This password reset link is incomplete."
      >
        <p>Request a new reset link and try again.</p>
      </AuthShell>
    );
  return <PasswordResetForm token={token} />;
}
