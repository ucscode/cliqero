import { getContainer } from "@/infrastructure/container";
import { canAccessOperator } from "@/modules/identity/capabilities";

export async function GET(request: Request) {
  try {
    const principal = await getContainer().principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    return Response.json(
      {
        accountId: principal.accountId,
        capabilities: [...principal.capabilities],
        canAccessOperator: canAccessOperator(principal.capabilities),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }
}
