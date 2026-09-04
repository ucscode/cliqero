import { redirect } from "next/navigation";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; callbackURL?: string }>;
}) {
  const params = await searchParams;
  if (!params.token) redirect("/email-verified?status=error");
  const callback = params.callbackURL || "/email-verified";
  redirect(
    `/api/auth/verify-email?token=${encodeURIComponent(params.token)}&callbackURL=${encodeURIComponent(callback)}`,
  );
}
