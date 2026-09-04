import { toNextJsHandler } from "better-auth/next-js";
import { getContainer } from "@/infrastructure/container";
import { requestHasHoneypot } from "@/security/honeypot";
import { verifyCaptchaToken } from "@/security/captcha";

// Resolve the application container per request. Keeping construction out of
// module evaluation allows `next build` to collect route configuration without
// requiring runtime database credentials.
async function route(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", request: Request) {
  if (await requestHasHoneypot(request))
    return Response.json({ error: "Request rejected" }, { status: 400 });
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
    )
      return Response.json({ error: "CAPTCHA verification failed" }, { status: 400 });
  }
  const handler = toNextJsHandler(getContainer().authentication.auth);
  return handler[method](request);
}
export const GET = (request: Request) => route("GET", request);
export const POST = (request: Request) => route("POST", request);
export const PATCH = (request: Request) => route("PATCH", request);
export const PUT = (request: Request) => route("PUT", request);
export const DELETE = (request: Request) => route("DELETE", request);
