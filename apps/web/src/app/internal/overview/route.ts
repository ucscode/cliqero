import { getContainer } from "@/infrastructure/container";
import { canAccessOperator } from "@/modules/identity/capabilities";

export async function GET(request: Request) {
  try {
    const principal = await getContainer().principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    if (!canAccessOperator(principal.capabilities))
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    return Response.json(await getContainer().operatorOverview.get(principal.capabilities), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }
}
