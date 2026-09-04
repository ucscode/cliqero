import { Suspense } from "react";
import { PasswordResetRequest } from "@/components/password-reset-request";
import { getCaptchaPublicConfiguration } from "@/security/captcha";
export const dynamic = "force-dynamic";
export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <PasswordResetRequest captcha={getCaptchaPublicConfiguration()} />
    </Suspense>
  );
}
