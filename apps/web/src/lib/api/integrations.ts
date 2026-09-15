export type Integration = {
  id: string;
  name: string;
  state: "active" | "revoked";
  listing_ids: string[];
  created_at: string;
};

export type IntegrationCredential = { id: string; credential: string };

export type ApiKeyMetadata = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

export type ApiKeyPage = { items: ApiKeyMetadata[] };

export type ApiKeyCreated = {
  id: string;
  secret: string;
  name: string;
  scopes: string[];
};

export type OperatorApiKeyCreated = ApiKeyCreated & {
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
};
export type OperatorApiKeyPage = {
  items: ApiKeyMetadata[];
  manageable_scopes: string[];
};
