import { z } from "zod";
import { apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";

const bodySchema = z.object({ email: z.email(), password: z.string().min(1) });
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const auth = getContainer().authentication;
    // Route the compatibility endpoint through Better Auth itself so its
    // HTTP-only cookie, SameSite and secure-cookie policy is authoritative.
    const upstreamUrl = new URL("/api/auth/sign-in/email", request.url);
    const forwardedHeaders = new Headers(request.headers);
    // Programmatic clients historically did not send Origin. The compatibility
    // route supplies the same-origin value while retaining Better Auth's
    // origin/CSRF validation for cross-origin requests.
    if (!forwardedHeaders.has("origin")) forwardedHeaders.set("origin", upstreamUrl.origin);
    const upstream = await auth.auth.handler(
      new Request(upstreamUrl, {
        method: "POST",
        headers: forwardedHeaders,
        body: JSON.stringify(body),
      }),
    );
    if (!upstream.ok) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    const payload = (await upstream.json()) as { user?: { id: string }; token?: string };
    if (!payload.user?.id || !payload.token) throw new Error("Authentication session unavailable");
    const account = await auth.accountForAuthUser(payload.user.id);
    if (!account) throw new Error("Account onboarding incomplete");
    const response = Response.json({
      account: { id: account.id, email: account.email, handle: account.handle },
      token: payload.token,
    });
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) response.headers.set("set-cookie", setCookie);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
