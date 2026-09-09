import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type DiagnosticValue =
  string | number | boolean | null | DiagnosticValue[] | { [key: string]: DiagnosticValue };

export type DevelopmentDiagnostic = {
  level: "debug" | "info" | "warn" | "error";
  event: string;
  method?: string;
  path?: string;
  publicCode?: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY =
  /(password|token|cookie|authorization|api[-_ ]?key|secret|captcha|honeypot|referenceid|website|set-cookie)/i;
const SENSITIVE_TEXT =
  /(password|token|cookie|authorization|api[-_ ]?key|secret|captcha|honeypot|referenceid|website)(\s*[=:]\s*)(?:Bearer\s+)?[^\s,;]+|([?&](?:token|password|api[-_ ]?key|secret)=)[^&\s]+/gi;

function redactText(value: string): string {
  return value.replace(SENSITIVE_TEXT, (_match, key, separator, queryKey) =>
    queryKey ? `${queryKey}[REDACTED]` : `${key}${separator}[REDACTED]`,
  );
}

function safeValue(value: unknown, key?: string): DiagnosticValue {
  if (key && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value === null) return null;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => safeValue(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        safeValue(entryValue, entryKey),
      ]),
    );
  }
  return String(value);
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return { internal_error_message: redactText(String(error)) };
  return {
    internal_error_name: error.name,
    internal_error_message: redactText(error.message),
    ...(error.stack ? { stack: redactText(error.stack) } : {}),
  };
}

function projectRoot(): string {
  const cwd = process.cwd();
  // npm runs workspace scripts from apps/web. Keep diagnostics at the
  // repository-level var/log path so `just dev-logs` can follow them.
  return path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps"
    ? path.resolve(cwd, "../..")
    : cwd;
}

/**
 * Append a development-only diagnostic without ever making the request depend
 * on the log file being writable. Production services continue to use their
 * normal container logging.
 */
export function writeDevelopmentDiagnostic(entry: DevelopmentDiagnostic): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const record = {
      timestamp: new Date().toISOString(),
      level: entry.level,
      event: entry.event,
      ...(entry.method ? { method: entry.method } : {}),
      ...(entry.path ? { path: entry.path } : {}),
      ...(entry.publicCode ? { public_code: entry.publicCode } : {}),
      ...(entry.error ? safeError(entry.error) : {}),
      ...(entry.metadata ? { metadata: safeValue(entry.metadata) } : {}),
    };
    const filePath = path.resolve(projectRoot(), "var", "log", "development.log");
    void mkdir(path.dirname(filePath), { recursive: true })
      .then(() => appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8"))
      .catch(() => {
        // Diagnostics are best effort and must never break an application request.
      });
  } catch {
    // Diagnostics are best effort and must never break an application request.
  }
}

export function logDevelopmentError(
  error: unknown,
  context: Omit<DevelopmentDiagnostic, "level" | "error">,
): void {
  writeDevelopmentDiagnostic({ ...context, level: "error", error });
}
