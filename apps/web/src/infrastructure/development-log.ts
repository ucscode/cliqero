import { appendFile, mkdir, stat, truncate } from "node:fs/promises";
import path from "node:path";
import type { LifecycleDiagnostic, LifecycleDiagnosticWriter } from "@/kernel/diagnostics";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_LOG_FILE = "development.log";
const SAFE_LOG_FILE = /^[A-Za-z0-9][A-Za-z0-9_-]*\.log$/;

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

function maximumLogBytes(): number {
  const configured = Number(process.env.DEVELOPMENT_LOG_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_BYTES;
}

function safeLogFileName(fileName: string): string {
  if (path.basename(fileName) !== fileName || !SAFE_LOG_FILE.test(fileName))
    throw new Error(`Invalid development diagnostic log file: ${fileName}`);
  return fileName;
}

function boundedRecord(record: string, limit: number): string {
  if (Buffer.byteLength(record, "utf8") <= limit) return record;
  const marker = `${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "warn",
    event: "development_log_record_truncated",
  })}\n`;
  if (Buffer.byteLength(marker, "utf8") <= limit) return marker;
  return Buffer.from(marker, "utf8").subarray(0, limit).toString("utf8");
}

async function appendDiagnostic(filePath: string, record: string, limit: number): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  let size = 0;
  try {
    size = (await stat(filePath)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const bounded = boundedRecord(record, limit);
  if (size >= limit || size + Buffer.byteLength(bounded, "utf8") > limit)
    await truncate(filePath, 0);
  await appendFile(filePath, bounded, "utf8");
}

function writeToDevelopmentLog(entry: DevelopmentDiagnostic, fileName: string): void {
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
    const filePath = path.resolve(projectRoot(), "var", "log", safeLogFileName(fileName));
    void appendDiagnostic(filePath, `${JSON.stringify(record)}\n`, maximumLogBytes()).catch(() => {
      // Diagnostics are best effort and must never break an application request.
    });
  } catch {
    // Diagnostics are best effort and must never break an application request.
  }
}

/**
 * Append a development-only diagnostic without ever making the request depend
 * on the log file being writable. Production services continue to use their
 * normal container logging.
 */
export function writeDevelopmentDiagnostic(
  entry: DevelopmentDiagnostic,
  options: { fileName?: string } = {},
): void {
  if (process.env.NODE_ENV !== "development") return;
  writeToDevelopmentLog(entry, options.fileName ?? DEFAULT_LOG_FILE);
}

export function createDevelopmentDiagnosticWriter(
  fileName = DEFAULT_LOG_FILE,
): LifecycleDiagnosticWriter {
  safeLogFileName(fileName);
  return {
    write(entry: LifecycleDiagnostic) {
      writeDevelopmentDiagnostic(entry, { fileName });
    },
  };
}

export function writeApiDevelopmentDiagnostic(entry: DevelopmentDiagnostic): void {
  writeDevelopmentDiagnostic(entry, { fileName: "api.log" });
}

export function installDevelopmentProcessDiagnostics(): void {
  if (process.env.NODE_ENV !== "development") return;
  const state = globalThis as typeof globalThis & {
    __cliqeroProcessDiagnosticsInstalled?: boolean;
  };
  if (state.__cliqeroProcessDiagnosticsInstalled) return;
  state.__cliqeroProcessDiagnosticsInstalled = true;
  let exitScheduled = false;
  const failFast = (event: string, error: unknown) => {
    writeDevelopmentDiagnostic({ level: "error", event, error }, { fileName: "process.log" });
    if (exitScheduled) return;
    exitScheduled = true;
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
  };
  process.on("uncaughtException", (error) => failFast("process.uncaught_exception", error));
  process.on("unhandledRejection", (reason) => failFast("process.unhandled_rejection", reason));
}

export function logDevelopmentError(
  error: unknown,
  context: Omit<DevelopmentDiagnostic, "level" | "error">,
): void {
  writeApiDevelopmentDiagnostic({ ...context, level: "error", error });
}
