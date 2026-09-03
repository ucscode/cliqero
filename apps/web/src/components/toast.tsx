import { Alert } from "./ui/alert";
import type { ReactNode } from "react";

export function Toast({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  return (
    <Alert
      className={
        tone === "success" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
      }
    >
      {children}
    </Alert>
  );
}
