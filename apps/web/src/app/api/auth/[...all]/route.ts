import { toNextJsHandler } from "better-auth/next-js";
import { getContainer } from "@/infrastructure/container";
import {
  logDevelopmentError,
  writeApiDevelopmentDiagnostic,
} from "@/infrastructure/development-log";
import { honeypotRejectionResponse, requestHoneypotSource } from "@/security/honeypot";
import { verifyCaptchaToken } from "@/security/captcha";

// Resolve the application container per request. Keeping construction out of
// module evaluation allows `next build` to collect route configuration without
// requiring runtime database credentials.
async function route(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", request: Request) {
  const honeypotSource = await requestHoneypotSource(request);
  if (honeypotSource) {
    writeApiDevelopmentDiagnostic({
      level: "warn",
      event: "security.honeypot.rejected",
      method: request.method,
      path: new URL(request.url).pathname,
      metadata: { source: honeypotSource },
    });
    return honeypotRejectionResponse();
  }
  const captchaRequired =
    method === "POST" &&
    (request.url.includes("request-password-reset") || request.url.includes("sign-up/email"));
  if (captchaRequired) {
    const body = (await request
      .clone()
      .json()
      .catch(() => ({}))) as { captchaToken?: unknown };
    if (
      !(await verifyCaptchaToken(
        body.captchaToken ?? request.headers.get("x-cliqero-captcha-token"),
        request.headers.get("x-forwarded-for"),
        true,
      ))
    ) {
      writeApiDevelopmentDiagnostic({
        level: "warn",
        event: "security.captcha.rejected",
        method: request.method,
        path: new URL(request.url).pathname,
      });
      return Response.json({ error: "CAPTCHA verification failed" }, { status: 400 });
    }
  }
  try {
    const handler = toNextJsHandler(getContainer().authentication.auth);
    return await handler[method](request);
  } catch (error) {
    const url = new URL(request.url);
    logDevelopmentError(error, {
      event: "auth.request.failed",
      method: request.method,
      path: url.pathname,
      metadata: {
        operation: url.pathname.replace(/^\/api\/auth\/?/, "") || "root",
        callback_origin: url.origin,
      },
    });
    throw error;
  }
}
export const GET = (request: Request) => route("GET", request);
export const POST = (request: Request) => route("POST", request);
export const PATCH = (request: Request) => route("PATCH", request);
export const PUT = (request: Request) => route("PUT", request);
export const DELETE = (request: Request) => route("DELETE", request);
