import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { getCaptchaPublicConfiguration } from "@/security/captcha";
import { hasGoogleAuthentication } from "@/config/auth";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  const googleEnabled = hasGoogleAuthentication();
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--canvas)]" />}>
      <AuthForm
        mode="register"
        googleEnabled={googleEnabled}
        captcha={getCaptchaPublicConfiguration()}
      />
    </Suspense>
  );
}
