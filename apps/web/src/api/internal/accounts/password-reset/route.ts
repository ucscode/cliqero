import { z } from "zod";
import { apiError } from "@/api/compat/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { getContainer } from "@/infrastructure/container";
import { hasCapability } from "@/modules/identity/capabilities";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/modules/identity/password-policy";

const bodySchema = z
  .object({
    new_password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    confirm_password: z.string(),
  })
  .strict()
  .refine((body) => body.new_password === body.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match.",
  });

export async function POST(request: Request, accountId: string) {
  if (request.headers.has("authorization"))
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  try {
    const container = getContainer();
    const principal = await container.principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    if (!hasCapability(principal.capabilities, "accounts.manage"))
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    const { new_password } = bodySchema.parse(await request.json());
    await container.operatorAccountManagement.resetPassword(
      principal.accountId,
      z.uuid().parse(accountId),
      new_password,
    );
    return Response.json(
      { success: true, sessions_revoked: true },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error, request);
  }
}
