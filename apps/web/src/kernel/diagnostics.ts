export type LifecycleDiagnostic = {
  level: "debug" | "info" | "warn" | "error";
  event: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

export interface LifecycleDiagnosticWriter {
  write(entry: LifecycleDiagnostic): void;
}
