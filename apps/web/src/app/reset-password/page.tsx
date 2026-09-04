import { PasswordResetForm } from "@/components/password-reset-form";
import { PublicPage } from "@/components/public-page";

export default async function ResetPasswordQueryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  if (!token)
    return (
      <PublicPage title="Reset link unavailable" intro="This password reset link is incomplete.">
        <p>Request a new reset link and try again.</p>
      </PublicPage>
    );
  return <PasswordResetForm token={token} />;
}
