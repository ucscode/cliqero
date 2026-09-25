import Link from "next/link";
import { siteConfig } from "@/config/site";
import { AuthShell } from "@/components/auth/shell";

export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <AuthShell
      eyebrow="Account security"
      title={status === "error" ? "Verification link unavailable" : "Email verified"}
      description={
        status === "error"
          ? "This verification link is missing or expired. Request a new one from your account."
          : `Your ${siteConfig.name} email is verified. You can continue using your account.`
      }
    >
      <Link className="text-emerald-700 underline" href="/dashboard">
        {status === "error" ? "Return to your account" : "Continue to your account"}
      </Link>
    </AuthShell>
  );
}
