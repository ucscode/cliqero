import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--canvas)]" />}>
      <AuthForm mode="register" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
