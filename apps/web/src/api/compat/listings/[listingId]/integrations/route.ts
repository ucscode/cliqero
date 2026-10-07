import { z } from "zod";
import { apiError, authenticatedPrincipal } from "../../../http";
import { authorizeListingIntegration } from "../../integrations/access";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";
import { deleteResourceIds, resourceDeleteSchema } from "@/api/shared/resource-delete";

const bodySchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export async function DELETE(
  request: Request,
  {
    params,
    container,
  }: { params: Promise<{ listingId: string }>; container?: ApplicationContainer },
) {
  try {
    const { listingId } = await params;
    const currentContainer = container ?? getContainer();
    const result = await authorizeListingIntegration(
      await authenticatedPrincipal(request, currentContainer),
      currentContainer,
      request,
      listingId,
    );
    if ("response" in result) return result.response;
    const { ids } = resourceDeleteSchema().parse(await request.json());
    const outcomes = await deleteResourceIds(ids, async (integrationId) => {
      if (result.access !== "manager") {
        const integration = await result.container.integrations.find(
          result.principal.account.id,
          integrationId,
        );
        if (!integration.listing_ids.includes(listingId)) throw new Error("Integration not found");
      }
      return result.container.integrations.deleteForListing(
        result.principal.account.id,
        listingId,
        integrationId,
      );
    });
    return Response.json(outcomes);
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Invalid integration IDs", code: "invalid_request" },
        { status: 400 },
      );
    return apiError(error, request);
  }
}

export async function GET(
  request: Request,
  {
    params,
    container,
  }: { params: Promise<{ listingId: string }>; container?: ApplicationContainer },
) {
  try {
    const { listingId } = await params;
    const currentContainer = container ?? getContainer();
    const result = await authorizeListingIntegration(
      await authenticatedPrincipal(request, currentContainer),
      currentContainer,
      request,
      listingId,
    );
    if ("response" in result) return result.response;
    return Response.json({ items: await result.container.integrations.listForListing(listingId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  {
    params,
    container,
  }: { params: Promise<{ listingId: string }>; container?: ApplicationContainer },
) {
  try {
    const { listingId } = await params;
    const currentContainer = container ?? getContainer();
    const result = await authorizeListingIntegration(
      await authenticatedPrincipal(request, currentContainer),
      currentContainer,
      request,
      listingId,
    );
    if ("response" in result) return result.response;
    const { name } = bodySchema.parse(await request.json());
    const created = await result.container.database.transaction(() =>
      result.access === "manager"
        ? result.container.integrations.createManaged(result.principal.account.id, name, listingId)
        : result.container.integrations.create(result.principal.account.id, name, listingId),
    );
    return Response.json(
      { integration_id: created.id, credential: created.credential },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
