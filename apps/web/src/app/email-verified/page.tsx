import Link from "next/link";
import { siteConfig } from "@/config/site";
import { PublicPage } from "@/components/public-page";

export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <PublicPage
      title={status === "error" ? "Verification link unavailable" : "Email verified"}
      intro={
        status === "error"
          ? "This verification link is missing or expired. Request a new one from your account."
          : `Your ${siteConfig.name} email is verified. You can continue using your account.`
      }
    >
      <Link className="text-emerald-700 underline" href="/login">
        Return to sign in
      </Link>
    </PublicPage>
  );
}
