import { getContainer } from "@/infrastructure/container";

export async function GET(request: Request) {
  try {
    const principal = await getContainer().principalResolver.resolve(request);
    if (principal.kind !== "user_session")
      return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
    return Response.json(
      {
        authenticated: true,
        account: { id: principal.account.id, username: principal.account.username },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }
}
