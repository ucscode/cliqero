import { PasswordResetForm } from "@/components/password-reset-form";
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <PasswordResetForm token={(await params).token} />;
}
