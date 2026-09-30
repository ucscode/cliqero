import { getContainer, type ApplicationContainer } from "@/infrastructure/container";
import type { ApiKeyRecord } from "@/modules/identity/api/keys";
import { apiError } from "@/api/http";
import {
  apiKeyBulkDeleteSchema,
  apiKeyCreateSchema,
  apiKeyListQuerySchema,
  apiKeyReassignSchema,
  apiKeyUpdateSchema,
} from "./contracts";

type ApiKeyManagementContainer = Pick<
  ApplicationContainer,
  "principalResolver" | "operatorApiKeys"
>;

type RateLimitWindow = { startedAt: number; count: number };

export class ApiKeyManagementRateLimiter {
  private readonly windows = new Map<string, RateLimitWindow>();

  constructor(
    private readonly limit = 30,
    private readonly windowMilliseconds = 60_000,
    private readonly now = () => Date.now(),
  ) {}

  allow(accountId: string) {
    const now = this.now();
    for (const [key, window] of this.windows)
      if (now - window.startedAt >= this.windowMilliseconds) this.windows.delete(key);
    const current = this.windows.get(accountId);
    if (!current || now - current.startedAt >= this.windowMilliseconds) {
      this.windows.set(accountId, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }
}

const defaultRateLimiter = new ApiKeyManagementRateLimiter();
const JSON_LIMIT_BYTES = 16 * 1024;
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function unauthorized() {
  return response({ error: "Unauthorized", code: "unauthorized" }, 401);
}

function forbidden() {
  return response({ error: "Forbidden", code: "forbidden" }, 403);
}

function rateLimited() {
  return response({ error: "Too many requests", code: "rate_limited" }, 429);
}

function badRequest(message: string, code = "invalid_request", status = 400) {
  return response({ error: message, code }, status);
}

function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin";
}

async function parseJson(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    return { error: badRequest("A JSON request body is required.", "unsupported_media_type", 415) };
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > JSON_LIMIT_BYTES)
    return { error: badRequest("Request body is too large.", "payload_too_large", 413) };
  try {
    return { value: JSON.parse(body) as unknown };
  } catch {
    return { error: badRequest("Request body must contain valid JSON.") };
  }
}

function metadata(key: ApiKeyRecord) {
  const expired = Boolean(key.expiresAt && key.expiresAt <= new Date());
  return {
    id: key.id,
    name: key.name,
    account_id: key.accountId,
    account_username: key.accountUsername ?? "",
    account_email: key.accountEmail ?? null,
    scopes: key.scopes,
    state: key.revokedAt ? "revoked" : expired ? "expired" : "active",
    created_at: key.createdAt.toISOString(),
    last_used_at: key.lastUsedAt?.toISOString() ?? null,
    expires_at: key.expiresAt?.toISOString() ?? null,
    revoked_at: key.revokedAt?.toISOString() ?? null,
  };
}

export class InternalApiKeyManagementRoutes {
  constructor(
    private readonly container: ApiKeyManagementContainer,
    private readonly rateLimiter: ApiKeyManagementRateLimiter = defaultRateLimiter,
  ) {}

  async collection(request: Request): Promise<Response> {
    const principal = await this.session(request);
    if (principal instanceof Response) return principal;
    try {
      const url = new URL(request.url);
      const query = apiKeyListQuerySchema.parse(Object.fromEntries(url.searchParams));
      const result = await this.container.operatorApiKeys.listForSession(principal.accountId, {
        search: query.search,
        accountId: query.account_id,
        state: query.state,
        sort: query.sort,
        direction: query.direction,
        limit: query.limit,
        cursor: query.cursor,
      });
      return response({
        items: result.items.map(metadata),
        manageable_scopes: result.manageableScopes,
        next_cursor: result.nextCursor,
      });
    } catch (error) {
      return apiError(error, request);
    }
  }

  async create(request: Request): Promise<Response> {
    const principal = await this.session(request, true);
    if (principal instanceof Response) return principal;
    if (!this.rateLimiter.allow(principal.accountId)) return rateLimited();
    try {
      const parsed = await parseJson(request);
      if (parsed.error) return parsed.error;
      const body = apiKeyCreateSchema.parse(parsed.value);
      const created = await this.container.operatorApiKeys.createForSession(principal.accountId, {
        accountId: body.account_id,
        name: body.name,
        scopes: body.scopes,
        expiresAt:
          body.expires_at === undefined
            ? undefined
            : body.expires_at === null
              ? null
              : new Date(body.expires_at),
      });
      return response(
        {
          ...metadata({
            ...created,
            accountId: body.account_id ?? principal.accountId,
            accountUsername: "",
            accountEmail: null,
            lastUsedAt: null,
            revokedAt: null,
          }),
          secret: created.secret,
        },
        201,
      );
    } catch (error) {
      return apiError(error, request);
    }
  }

  async item(request: Request, keyId: string): Promise<Response> {
    const principal = await this.session(request, request.method !== "GET");
    if (principal instanceof Response) return principal;
    if (request.method !== "GET" && !this.rateLimiter.allow(principal.accountId))
      return rateLimited();
    try {
      if (request.method === "GET") {
        const key = await this.container.operatorApiKeys.getForSession(principal.accountId, keyId);
        return response({ item: metadata(key) });
      }
      if (request.method === "PATCH") {
        const parsed = await parseJson(request);
        if (parsed.error) return parsed.error;
        const body = apiKeyUpdateSchema.parse(parsed.value);
        if (body.account_id) return badRequest("An API key's owning account cannot be changed.");
        const key = await this.container.operatorApiKeys.updateForSession(
          principal.accountId,
          keyId,
          {
            name: body.name,
            scopes: body.scopes,
            expiresAt:
              body.expires_at === undefined
                ? undefined
                : body.expires_at === null
                  ? null
                  : new Date(body.expires_at),
            status: body.state,
          },
        );
        return response({ item: key ? metadata(key) : null });
      }
      if (request.method === "DELETE") {
        await this.container.operatorApiKeys.deleteForSession(principal.accountId, keyId);
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      }
      return badRequest("Method not allowed.", "method_not_allowed", 405);
    } catch (error) {
      return apiError(error, request);
    }
  }

  private async session(request: Request, mutation = false) {
    if (request.headers.has("authorization")) return unauthorized();
    if (mutation && !assertSameOrigin(request)) return forbidden();
    try {
      const principal = await this.container.principalResolver.resolve(request);
      if (principal.kind !== "user_session") return unauthorized();
      return principal;
    } catch (error) {
      return apiError(error, request);
    }
  }

  async bulkDelete(request: Request): Promise<Response> {
    const principal = await this.session(request, true);
    if (principal instanceof Response) return principal;
    if (!this.rateLimiter.allow(principal.accountId)) return rateLimited();
    try {
      const parsed = await parseJson(request);
      if (parsed.error) return parsed.error;
      const body = apiKeyBulkDeleteSchema.parse(parsed.value);
      const outcome = await this.container.operatorApiKeys.bulkDeleteForSession(
        principal.accountId,
        body.ids,
      );
      return response(outcome);
    } catch (error) {
      return apiError(error, request);
    }
  }

  async reassign(request: Request, keyId: string): Promise<Response> {
    const principal = await this.session(request, true);
    if (principal instanceof Response) return principal;
    if (!this.rateLimiter.allow(principal.accountId)) return rateLimited();
    try {
      const parsed = await parseJson(request);
      if (parsed.error) return parsed.error;
      const body = apiKeyReassignSchema.parse(parsed.value);
      const key = await this.container.operatorApiKeys.reassignForSession(
        principal.accountId,
        keyId,
        {
          accountId: body.account_id,
          name: body.name,
          scopes: body.scopes,
          expiresAt: body.expires_at === null ? null : new Date(body.expires_at),
        },
      );
      return response({ ...metadata(key), secret: key.secret });
    } catch (error) {
      return apiError(error, request);
    }
  }
}

export function internalApiKeyCollection(request: Request) {
  return new InternalApiKeyManagementRoutes(getContainer()).collection(request);
}

export function internalApiKeyCreate(request: Request) {
  return new InternalApiKeyManagementRoutes(getContainer()).create(request);
}

export function internalApiKeyItem(request: Request, keyId: string) {
  return new InternalApiKeyManagementRoutes(getContainer()).item(request, keyId);
}

export function internalApiKeyReassign(request: Request, keyId: string) {
  return new InternalApiKeyManagementRoutes(getContainer()).reassign(request, keyId);
}

export function internalApiKeyBulkDelete(request: Request) {
  return new InternalApiKeyManagementRoutes(getContainer()).bulkDelete(request);
}
