import { z } from "zod";
import { apiError } from "@/api/compat/http";
import { isSameOriginRequest } from "@/api/internal/security/same-origin";
import { getContainer } from "@/infrastructure/container";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set"), pin: z.string() }).strict(),
  z.object({ action: z.literal("change"), current_pin: z.string(), pin: z.string() }).strict(),
  z.object({ action: z.literal("request_recovery") }).strict(),
  z.object({ action: z.literal("recover"), code: z.string(), pin: z.string() }).strict(),
]);

async function accountId(request: Request): Promise<string | Response> {
  const principal = await getContainer().principalResolver.resolve(request);
  return principal.kind === "user_session"
    ? principal.accountId
    : Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  try {
    const id = await accountId(request);
    if (id instanceof Response) return id;
    return Response.json(await getContainer().transactionPin.status(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error, request);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  try {
    const id = await accountId(request);
    if (id instanceof Response) return id;
    const input = actionSchema.parse(await request.json());
    const service = getContainer().transactionPin;
    if (input.action === "set") await service.set(id, input.pin);
    else if (input.action === "change") await service.change(id, input.current_pin, input.pin);
    else if (input.action === "request_recovery") await service.requestRecovery(id);
    else await service.recover(id, input.code, input.pin);
    return Response.json(
      { ...(await service.status(id)), success: true },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error, request);
  }
}
