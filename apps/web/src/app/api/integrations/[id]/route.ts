import { z } from "zod";
import { authenticatedAccount, apiError } from "../../http";
import { getContainer } from "@/infrastructure/container";
const schema = z.object({ name: z.string().min(1).max(100) }).strict();
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await getContainer().integrations.find(a.id, (await params).id));
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(
      await getContainer().integrations.update(
        a.id,
        (await params).id,
        schema.parse(await request.json()).name,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticatedAccount(request);
  if (!a) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await getContainer().integrations.revoke(a.id, (await params).id));
  } catch (error) {
    return apiError(error);
  }
}
