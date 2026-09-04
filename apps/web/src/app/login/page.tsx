import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { getCaptchaPublicConfiguration } from "@/security/captcha";
import { hasGoogleAuthentication } from "@/config/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = hasGoogleAuthentication();
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
