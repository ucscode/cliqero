import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { getCaptchaPublicConfiguration } from "@/security/captcha";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--canvas)]" />}>
      <AuthForm
        mode="login"
        googleEnabled={googleEnabled}
        captcha={getCaptchaPublicConfiguration()}
      />
    </Suspense>
  );
}
