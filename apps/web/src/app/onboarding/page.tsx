import { Suspense } from "react";
import { OnboardingForm } from "@/components/onboarding-form";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--canvas)]" />}>
      <OnboardingForm />
    </Suspense>
  );
}
