import { Suspense } from "react";
import { OnboardingForm } from "@/components/onboarding-form";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="page-loading" />}>
      <OnboardingForm />
    </Suspense>
  );
}
