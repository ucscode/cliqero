import { z } from "zod";
import { apiError, authenticatedPrincipal } from "../../../../http";
import { authorizeListingIntegration } from "../../../integrations/access";
import { getContainer, type ApplicationContainer } from "@/infrastructure/container";

const schema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export async function GET(
  request: Request,
  {
    params,
    container,
  }: {
    params: Promise<{ listingId: string; integrationId: string }>;
    container?: ApplicationContainer;
  },
) {
  try {
    const values = await params;
    const currentContainer = container ?? getContainer();
    const result = await authorizeListingIntegration(
      await authenticatedPrincipal(request, currentContainer),
      currentContainer,
      request,
      values.listingId,
    );
    if ("response" in result) return result.response;
    if (result.access === "manager") {
      const integration = (
        await result.container.integrations.listForListing(values.listingId)
      ).find((item) => item.id === values.integrationId);
      if (!integration) return Response.json({ error: "Integration not found" }, { status: 404 });
      return Response.json(integration);
    }
    const integration = await result.container.integrations.find(
      result.principal.account.id,
      values.integrationId,
    );
    if (!integration.listing_ids.includes(values.listingId))
      return Response.json({ error: "Integration not found" }, { status: 404 });
    return Response.json(integration);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  {
    params,
    container,
  }: {
    params: Promise<{ listingId: string; integrationId: string }>;
    container?: ApplicationContainer;
  },
) {
  try {
    const values = await params;
    const currentContainer = container ?? getContainer();
    const result = await authorizeListingIntegration(
      await authenticatedPrincipal(request, currentContainer),
      currentContainer,
      request,
      values.listingId,
    );
    if ("response" in result) return result.response;
    if (result.access !== "owner")
      return Response.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
    const integration = await result.container.integrations.find(
      result.principal.account.id,
      values.integrationId,
    );
    if (!integration.listing_ids.includes(values.listingId))
      return Response.json({ error: "Integration not found" }, { status: 404 });
    const { name } = schema.parse(await request.json());
    return Response.json(
      await result.container.integrations.update(
        result.principal.account.id,
        values.integrationId,
        name,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  {
    params,
    container,
  }: {
    params: Promise<{ listingId: string; integrationId: string }>;
    container?: ApplicationContainer;
  },
) {
  try {
    const values = await params;
    const currentContainer = container ?? getContainer();
    const result = await authorizeListingIntegration(
      await authenticatedPrincipal(request, currentContainer),
      currentContainer,
      request,
      values.listingId,
    );
    if ("response" in result) return result.response;
    if (result.access === "manager")
      return Response.json(
        await result.container.integrations.revokeForListing(
          result.principal.account.id,
          values.listingId,
          values.integrationId,
        ),
      );
    const integration = await result.container.integrations.find(
      result.principal.account.id,
      values.integrationId,
    );
    if (!integration.listing_ids.includes(values.listingId))
      return Response.json({ error: "Integration not found" }, { status: 404 });
    return Response.json(
      await result.container.integrations.revoke(result.principal.account.id, values.integrationId),
    );
  } catch (error) {
    return apiError(error);
  }
}
