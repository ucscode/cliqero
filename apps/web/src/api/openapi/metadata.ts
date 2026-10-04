type OpenApiOperation = Record<string, unknown>;
export type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  tags?: { name: string; description?: string }[];
  components?: {
    securitySchemes?: Record<string, Record<string, string>>;
    [key: string]: unknown;
  };
};
export type LegacyRoute = {
  path: string;
  methods: readonly {
    method: string;
    access: { mode: string; scope?: string; apiKey?: "allow" | "reject" };
  }[];
};
export type OpenApiMetadataEntry = {
  path: string;
  method: string;
  mode: string;
  scope?: string;
  capability?: string;
  apiKey?: "allow" | "reject";
};

type JsonSchema = Record<string, unknown>;
const scalar = (type: string, extra: Record<string, unknown> = {}): JsonSchema => ({
  type,
  ...extra,
});
const text = scalar("string");
const uuid = scalar("string", { format: "uuid" });
const dateTime = scalar("string", { format: "date-time" });
const nullable = (schema: JsonSchema): JsonSchema => ({ ...schema, nullable: true });
const list = (items: JsonSchema): JsonSchema => scalar("array", { items });
const object = (
  properties: Record<string, JsonSchema>,
  required: string[] = Object.keys(properties),
): JsonSchema => scalar("object", { properties, required, additionalProperties: false });
const page = (item: JsonSchema, cursor = "next_cursor"): JsonSchema =>
  object({ items: list(item), [cursor]: nullable(text) });

const money = object({ amount_minor: text, currency: text });
const listingMoney = object({ minor_amount: text, currency: text });
const fundingState = scalar("string", {
  enum: [
    "initialization_pending",
    "initializing",
    "awaiting_payment",
    "verification_pending",
    "confirmed",
    "failed",
    "blocked",
    "cancelled",
    "expired",
    "reconciliation_pending",
  ],
});
const checkout = object({
  id: uuid,
  purchase_id: uuid,
  state: scalar("string", { enum: ["pending", "paid", "failed"] }),
  amount_minor: text,
  currency: text,
});
const checkoutPayment = object({
  ...((checkout.properties ?? {}) as Record<string, JsonSchema>),
  available: money,
  pending: money,
  shortfall: money,
});
const listingMedia = object({
  id: uuid,
  listing_id: uuid,
  url: text,
  mime_type: scalar("string", { enum: ["image/png", "image/jpeg", "image/gif", "image/webp"] }),
  original_filename: text,
  byte_size: text,
  width: scalar("integer"),
  height: scalar("integer"),
  position: scalar("integer"),
  alt_text: nullable(text),
  state: scalar("string", { enum: ["active", "deletion_pending", "deleted"] }),
  created_at: dateTime,
});
const listingTransferInputRecord = object(
  {
    id: uuid,
    retry_identity: text,
    external_key: text,
    title: text,
    short_description: text,
    long_description: text,
    price_minor: text,
    currency: text,
    destination: scalar("string", { format: "uri" }),
    metadata: scalar("object", {
      additionalProperties: {
        oneOf: [text, scalar("number"), scalar("boolean"), { type: "null" }],
      },
    }),
    state: scalar("string", { enum: ["draft", "published", "archived"] }),
    media: list(
      object(
        {
          media_id: uuid,
          transfer_identity: text,
          url: scalar("string", { format: "uri" }),
          alt_text: text,
          position: scalar("integer"),
        },
        ["url", "position"],
      ),
    ),
  },
  [
    "title",
    "short_description",
    "long_description",
    "price_minor",
    "currency",
    "destination",
    "metadata",
    "state",
    "media",
  ],
);
const listingTransferOutputRecord = object(
  {
    id: uuid,
    external_key: text,
    title: text,
    short_description: text,
    long_description: text,
    price_minor: text,
    currency: text,
    destination: scalar("string", { format: "uri" }),
    metadata: scalar("object", {
      additionalProperties: {
        oneOf: [text, scalar("number"), scalar("boolean"), { type: "null" }],
      },
    }),
    state: scalar("string", { enum: ["draft", "published", "archived"] }),
    media: list(
      object({
        media_id: uuid,
        transfer_identity: text,
        url: scalar("string", { format: "uri" }),
        alt_text: text,
        position: scalar("integer"),
      }),
    ),
  },
  [
    "id",
    "title",
    "short_description",
    "long_description",
    "price_minor",
    "currency",
    "destination",
    "metadata",
    "state",
    "media",
  ],
);
const importRecordResult = object(
  {
    index: scalar("integer"),
    status: scalar("string", { enum: ["created", "updated", "skipped", "failed"] }),
    listing_id: uuid,
    retry_identity: text,
    code: text,
    message: text,
    retryable: scalar("boolean"),
  },
  ["index", "status", "retryable"],
);
const listing = object(
  {
    id: uuid,
    managed_by: uuid,
    title: text,
    short_description: text,
    long_description: text,
    price: listingMoney,
    compare_at_price: nullable(listingMoney),
    visibility: scalar("string", { enum: ["public", "authenticated"] }),
    categories: list(object({ id: uuid, name: text, slug: text })),
    metadata: scalar("object", {
      additionalProperties: {
        oneOf: [text, scalar("number"), scalar("boolean"), { type: "null" }],
      },
    }),
    state: scalar("string", { enum: ["draft", "published", "archived"] }),
    featured_position: nullable(scalar("integer")),
    media: list(
      object({
        id: uuid,
        url: text,
        mime_type: text,
        width: scalar("integer"),
        height: scalar("integer"),
        position: scalar("integer"),
        alt_text: nullable(text),
      }),
    ),
    rating: nullable(object({ average: scalar("number"), count: scalar("integer") })),
    destination: scalar("string", { format: "uri" }),
    external_key: nullable(text),
  },
  [
    "id",
    "managed_by",
    "title",
    "short_description",
    "long_description",
    "price",
    "compare_at_price",
    "visibility",
    "categories",
    "metadata",
    "state",
    "featured_position",
    "media",
    "rating",
  ],
);
const withdrawalDestinationField = object(
  {
    name: text,
    label: text,
    value: text,
    displayValue: text,
    type: scalar("string", { enum: ["text", "select", "textarea", "fixed", "hidden"] }),
    copyable: scalar("boolean"),
  },
  ["name", "label", "value", "type", "copyable"],
);
const savedWithdrawalDestination = object({
  id: uuid,
  method: object({ id: text, display_name: text, available: scalar("boolean") }),
  name: text,
  fields: list(withdrawalDestinationField),
  status: scalar("string", { enum: ["active", "archived"] }),
  created_at: dateTime,
  updated_at: dateTime,
});
const review = object(
  {
    id: uuid,
    listing_id: uuid,
    rating: scalar("integer", { minimum: 1, maximum: 5 }),
    body: nullable(text),
    status: scalar("string", { enum: ["pending", "approved", "rejected"] }),
    created_at: dateTime,
    updated_at: dateTime,
    moderated_at: nullable(dateTime),
    reviewer: text,
    is_mine: scalar("boolean"),
    listing_title: text,
  },
  ["id", "listing_id", "rating", "body", "status", "created_at", "updated_at", "moderated_at"],
);
const withdrawalDomainResult = object(
  {
    id: uuid,
    accountId: uuid,
    amount: object({ minorAmount: text, currency: text }),
    fee: object({ minorAmount: text, currency: text }),
    netAmount: object({ minorAmount: text, currency: text }),
    destination: object({
      savedDestinationId: uuid,
      method: text,
      methodName: text,
      name: text,
      fields: list(
        object(
          {
            name: text,
            label: text,
            value: text,
            displayValue: text,
            type: scalar("string", { enum: ["text", "select", "textarea", "fixed", "hidden"] }),
            copyable: scalar("boolean"),
          },
          ["name", "label", "value", "type", "copyable"],
        ),
      ),
    }),
    state: scalar("string", {
      enum: ["requested", "approved", "rejected", "cancelled", "completed", "failed"],
    }),
    idempotencyKey: text,
    correlationId: uuid,
    reason: nullable(text),
    externalReference: nullable(text),
    completionNote: nullable(text),
    completedBy: nullable(uuid),
    completedAt: nullable(dateTime),
    createdAt: dateTime,
    updatedAt: dateTime,
  },
  [
    "id",
    "accountId",
    "amount",
    "destination",
    "state",
    "idempotencyKey",
    "correlationId",
    "createdAt",
    "updatedAt",
  ],
);

/** Explicit projections for current route schemas that are intentionally opaque or incomplete. */
const responseSchemaOverrides: Record<string, JsonSchema> = {
  "GET /api/reviews 200": object({ items: list(review), next_cursor: nullable(text) }),
  "PATCH /api/reviews/{reviewId} 200": object({ item: review }),
  "PUT /api/accounts/{accountId}/capabilities 200": object({
    accountId: uuid,
    assignments: list(object({ capability: text, grantedAt: dateTime })),
  }),
  "PATCH /api/withdrawals/{withdrawalId} 200": withdrawalDomainResult,
  "POST /api/withdrawals/{withdrawalId}/cancel 200": withdrawalDomainResult,
  "POST /api/withdrawals/{withdrawalId}/complete 200": withdrawalDomainResult,
};

function applyResponseSchemaOverrides(document: OpenApiDocument) {
  for (const [key, schema] of Object.entries(responseSchemaOverrides)) {
    const [method, path, status] = key.split(" ");
    const response = document.paths[path]?.[method.toLowerCase()]?.responses;
    if (!response || typeof response !== "object") continue;
    const success = (response as Record<string, unknown>)[status];
    if (!success || typeof success !== "object") continue;
    const content = ((success as Record<string, unknown>).content ??= {}) as Record<
      string,
      Record<string, unknown>
    >;
    const media = (content["application/json"] ??= {}) as Record<string, unknown>;
    media.schema = schema;
  }
}

const withdrawalMethodField = {
  oneOf: [
    object(
      {
        name: text,
        label: text,
        description: text,
        required: scalar("boolean"),
        copyable: scalar("boolean"),
        attrs: scalar("object", {
          additionalProperties: { oneOf: [text, scalar("number"), scalar("boolean")] },
        }),
        type: scalar("string", { enum: ["text"] }),
        regex: text,
        enum: list(text),
      },
      ["name", "label", "required", "type"],
    ),
    object(
      {
        name: text,
        label: text,
        description: text,
        required: scalar("boolean"),
        copyable: scalar("boolean"),
        attrs: scalar("object", {
          additionalProperties: { oneOf: [text, scalar("number"), scalar("boolean")] },
        }),
        type: scalar("string", { enum: ["textarea"] }),
        regex: text,
        enum: list(text),
      },
      ["name", "label", "required", "type"],
    ),
    object(
      {
        name: text,
        label: text,
        description: text,
        required: scalar("boolean"),
        copyable: scalar("boolean"),
        attrs: scalar("object", {
          additionalProperties: { oneOf: [text, scalar("number"), scalar("boolean")] },
        }),
        type: scalar("string", { enum: ["select"] }),
        options: list(object({ key: text, label: text })),
      },
      ["name", "label", "required", "type", "options"],
    ),
    object(
      {
        name: text,
        label: text,
        description: text,
        type: scalar("string", { enum: ["fixed"] }),
        value: text,
        copyable: scalar("boolean"),
      },
      ["name", "label", "type", "value"],
    ),
    object(
      {
        name: text,
        label: text,
        description: text,
        type: scalar("string", { enum: ["hidden"] }),
        value: text,
        copyable: scalar("boolean"),
      },
      ["name", "label", "type", "value"],
    ),
  ],
};
const fundingStatus = object({
  id: uuid,
  provider: text,
  provider_display_name: text,
  funding_reference: text,
  provider_transaction_id: nullable(text),
  state: fundingState,
  amount_minor: text,
  currency: text,
  collection_amount_minor: text,
  collection_currency: text,
  created_at: nullable(dateTime),
  confirmed_at: nullable(dateTime),
});
const fundingDetail = object({
  id: uuid,
  state: fundingState,
  provider: text,
  provider_display_name: text,
  customer_action: nullable(text),
  funding_reference: text,
  provider_transaction_id: nullable(text),
  amount_minor: text,
  currency: text,
  collection_amount_minor: text,
  collection_currency: text,
  conversion: nullable(
    object({ from_currency: text, to_currency: text, rate: text, observed_at: dateTime }),
  ),
  provider_account_id: nullable(text),
  provider_account_snapshot: nullable(
    object({
      id: text,
      collectionCurrency: text,
      fields: list(
        object({
          name: text,
          label: text,
          value: text,
          displayValue: text,
          type: scalar("string", { enum: ["text", "select", "textarea", "fixed", "hidden"] }),
          copyable: scalar("boolean"),
        }),
      ),
    }),
  ),
  authorization_url: nullable(text),
  payment_address: nullable(text),
  payment_amount: nullable(text),
  payment_currency: nullable(text),
  asset: nullable(text),
  network: nullable(text),
  instructions: nullable(text),
  expires_at: nullable(dateTime),
  error_code: nullable(text),
  error_message: nullable(text),
  verification: nullable(
    object({ status: text, message: text, level: text, resolved: scalar("boolean") }),
  ),
  confirmed_at: nullable(dateTime),
  wallet_credit_state: nullable(text),
  evidence: nullable(
    object({
      id: uuid,
      transfer_reference: nullable(text),
      customer_note: nullable(text),
      proof: nullable(
        object({ original_filename: nullable(text), mime_type: text, byte_size: text }),
      ),
      created_at: dateTime,
    }),
  ),
});
const walletSummary = object({
  currency: text,
  available_minor: text,
  pending_minor: text,
  active_fundings: list(
    object({
      id: uuid,
      state: text,
      provider: text,
      provider_display_name: text,
      funding_reference: text,
      provider_transaction_id: nullable(text),
      amount_minor: text,
      currency: text,
      authorization_url: nullable(text),
      payment_address: nullable(text),
      payment_amount: nullable(text),
      payment_currency: nullable(text),
      network: nullable(text),
      instructions: nullable(text),
      expires_at: nullable(dateTime),
    }),
  ),
});

/** Exact response projections for compatibility operations not registered by a Zod OpenAPI route. */
const legacySuccessSchemas: Record<string, JsonSchema> = {
  "POST /api/access/verify": {
    oneOf: [
      object({
        authorized: scalar("boolean", { enum: [true] }),
        entitlement_id: uuid,
        listing_id: uuid,
        buyer_id: uuid,
      }),
      object({ authorized: scalar("boolean", { enum: [false] }) }),
    ],
  },
  "GET /api/health": object({ status: scalar("string", { enum: ["ok"] }), service: text }),
  "GET /api/checkouts": page(checkout),
  "POST /api/checkouts": object({
    id: uuid,
    purchase_id: uuid,
    state: scalar("string", { enum: ["pending", "paid", "failed"] }),
    required: money,
    available: money,
    shortfall: money,
  }),
  "GET /api/checkouts/{checkoutId}": checkout,
  "POST /api/checkouts/{checkoutId}/pay": checkoutPayment,
  "GET /api/checkout-quote": object({ required: money, available: money, shortfall: money }),
  "GET /api/earnings": object({
    balances: list(object({ currency: text, state: text, amount_minor: text })),
    withdrawal_currency: text,
    withdrawable_balances: list(object({ currency: text, amount_minor: text })),
  }),
  "GET /api/listings": page(listing),
  "GET /api/listings/{listingId}": listing,
  "POST /api/listings": listing,
  "PATCH /api/listings/{listingId}": listing,
  "GET /api/listings/{listingId}/media": object({ items: list(listingMedia) }),
  "GET /api/listings/{listingId}/media/{mediaId}": listingMedia,
  "POST /api/listings/{listingId}/media": listingMedia,
  "PATCH /api/listings/{listingId}/media/{mediaId}": listingMedia,
  "DELETE /api/listings/{listingId}/media/{mediaId}": object({ id: uuid, state: text }),
  "GET /api/listings/{listingId}/integrations": object({
    items: list(
      object({
        id: uuid,
        name: text,
        listing_ids: list(uuid),
        created_at: dateTime,
        updated_at: dateTime,
        status: scalar("string", { enum: ["active", "revoked"] }),
      }),
    ),
  }),
  "POST /api/listings/{listingId}/integrations": object({ integration_id: uuid, credential: text }),
  "GET /api/listings/{listingId}/integrations/{integrationId}": object({
    id: uuid,
    name: text,
    listing_ids: list(uuid),
    created_at: dateTime,
    updated_at: dateTime,
    status: scalar("string", { enum: ["active", "revoked"] }),
  }),
  "PATCH /api/listings/{listingId}/integrations/{integrationId}": object({
    id: uuid,
    name: text,
    listing_ids: list(uuid),
    created_at: dateTime,
    updated_at: dateTime,
    status: scalar("string", { enum: ["active", "revoked"] }),
  }),
  "DELETE /api/listings/{listingId}/integrations/{integrationId}": object({
    id: uuid,
    revoked: scalar("boolean"),
  }),
  "POST /api/listings/{listingId}/integrations/{integrationId}/rotate": object({
    integration_id: uuid,
    credential: text,
  }),
  "GET /api/listings/{listingId}/access": object({
    access_url: text,
  }),
  "GET /api/listings/{listingId}/referral-url": object({ listing_id: uuid, url: text }),
  "GET /api/listings/export": list(listingTransferOutputRecord),
  "POST /api/listings/import": object({
    total: scalar("integer"),
    created: scalar("integer"),
    updated: scalar("integer"),
    skipped: scalar("integer"),
    failed: scalar("integer"),
    records: list(importRecordResult),
  }),
  "POST /api/purchases/reverse": object({
    reversal: object({
      id: uuid,
      purchase_id: uuid,
      state: text,
      reason: text,
      amount_minor: text,
      currency: text,
      created_at: dateTime,
    }),
  }),
  "POST /api/earnings/settlement": object({
    claimed: scalar("integer"),
    settled: scalar("integer"),
  }),
  "GET /api/distribution-policy": object({
    platform_percentage: scalar("number"),
    levels: list(object({ level: scalar("integer"), percentage: scalar("number") })),
    allocated_percentage: scalar("number"),
    maximum_payable_level: scalar("integer"),
    nominal_platform_remainder_percentage: scalar("number"),
  }),
  "GET /api/referrals/account-url": object({ url: text }),
  "GET /api/referrals/direct": object({
    items: list(
      object({ id: uuid, username: text, display_name: nullable(text), joined_at: dateTime }),
    ),
    next_cursor: nullable(text),
  }),
  "GET /api/referrals/downline": object({
    items: list(
      object({
        id: uuid,
        username: text,
        display_name: nullable(text),
        level: scalar("integer"),
        upline: nullable(object({ id: uuid, username: text, display_name: nullable(text) })),
        direct_child_count: scalar("integer"),
      }),
    ),
    next_cursor: nullable(text),
  }),
  "POST /api/referrals/parent": object({
    child_account_id: uuid,
    parent_account_id: uuid,
    previous_parent_account_id: nullable(uuid),
    changed: scalar("boolean"),
  }),
  "GET /api/referrals/uplines": object({
    uplines: list(
      object({ id: uuid, username: text, display_name: nullable(text), level: scalar("integer") }),
    ),
  }),
  "GET /api/wallet": walletSummary,
  "GET /api/wallet/transactions": object({
    transactions: list(
      object({
        id: uuid,
        type: text,
        source_id: uuid,
        direction: text,
        label: text,
        reference: nullable(text),
        state: text,
        amount_minor: text,
        currency: text,
        created_at: dateTime,
        provider_display_name: nullable(text),
        provider_reference: nullable(text),
      }),
    ),
    next_cursor: nullable(text),
  }),
  "GET /api/wallet/transfer-quote": object({
    gross_amount_minor: text,
    fee_minor: text,
    net_amount_minor: text,
    currency: text,
  }),
  "POST /api/wallet/transfers": object({
    id: uuid,
    from: text,
    to: text,
    gross_amount_minor: text,
    fee_minor: text,
    net_amount_minor: text,
    currency: text,
    created_at: dateTime,
  }),
  "GET /api/wallet/funding/prepare": object({
    provider: text,
    amount_minor: text,
    currency: text,
    collection_amount_minor: text,
    collection_currency: text,
    payment_currency: nullable(text),
    funding_options: list(
      object({
        id: text,
        collection_currency: text,
        fields: list(object({ name: text, label: text, value: text, copyable: scalar("boolean") })),
      }),
    ),
    conversion: nullable(
      object({ from_currency: text, to_currency: text, rate: text, observed_at: dateTime }),
    ),
  }),
  "GET /api/funding-transactions": object({
    items: list(fundingStatus),
    next_cursor: nullable(text),
  }),
  "GET /api/funding-transactions/{fundingId}": fundingDetail,
  "POST /api/funding-transactions": object({
    id: uuid,
    state: text,
    amount_minor: text,
    currency: text,
    provider: text,
  }),
  "POST /api/funding-transactions/{fundingId}/cancel": object({ id: uuid, state: text }),
  "POST /api/funding-transactions/{fundingId}/initialize": fundingDetail,
  "POST /api/funding-transactions/{fundingId}/verify": object({
    id: uuid,
    state: text,
    provider_transaction_id: nullable(text),
    verification: nullable(
      object({ status: text, message: text, level: text, resolved: scalar("boolean") }),
    ),
  }),
  "POST /api/bank-transfer/funding-transactions/{fundingId}/evidence": object({
    id: uuid,
    funding_id: uuid,
    state: text,
    transfer_reference: nullable(text),
    customer_note: nullable(text),
    created_at: dateTime,
    proof: nullable(
      object({ original_filename: nullable(text), mime_type: text, byte_size: text }),
    ),
  }),
  "POST /api/direct-trc20/funding-transactions/{fundingId}/transaction": object({
    id: uuid,
    state: text,
    provider_transaction_id: nullable(text),
    verification: nullable(
      object({ status: text, message: text, level: text, resolved: scalar("boolean") }),
    ),
  }),
  "GET /api/withdrawal-methods": object({
    methods: list(
      object({
        id: text,
        display_name: text,
        description: text,
        fields: list(withdrawalMethodField),
      }),
    ),
  }),
  "GET /api/withdrawal-destinations": list(savedWithdrawalDestination),
  "GET /api/withdrawal-destinations/{destinationId}": savedWithdrawalDestination,
  "POST /api/withdrawal-destinations": savedWithdrawalDestination,
  "PATCH /api/withdrawal-destinations/{destinationId}": savedWithdrawalDestination,
  "DELETE /api/withdrawal-destinations/{destinationId}": object({
    id: uuid,
    deleted: scalar("boolean"),
  }),
};

const legacySuccessStatus: Record<string, string> = {
  "POST /api/checkouts": "201",
  "POST /api/listings": "201",
  "POST /api/listings/{listingId}/media": "201",
  "POST /api/listings/{listingId}/integrations": "201",
  "POST /api/listings/import": "207",
  "POST /api/funding-transactions": "201",
  "POST /api/bank-transfer/funding-transactions/{fundingId}/evidence": "201",
  "POST /api/direct-trc20/funding-transactions/{fundingId}/transaction": "202",
  "POST /api/withdrawal-destinations": "201",
  "DELETE /api/listings/{listingId}": "204",
  "DELETE /api/listings/{listingId}/media/{mediaId}": "202",
};

function response(path: string, method: string) {
  const key = `${method.toUpperCase()} ${path}`;
  const status = legacySuccessStatus[key] ?? "200";
  if (status === "204") return { "204": { description: "Listing deleted successfully" } };
  const schema = legacySuccessSchemas[key];
  if (!schema) throw new Error(`Missing explicit OpenAPI response contract for ${key}`);
  if (key === "GET /api/listings/export")
    return {
      [status]: {
        description: "Listing catalogue export in the requested format",
        content: {
          "application/json": { schema },
          "text/csv": {
            schema: text,
            example:
              'id,retry_identity,external_key,title,short_description,long_description,price_minor,currency,destination,metadata,state,media\n"3fa85f64-5717-4562-b3fc-2c963f66afa6","listing:3fa85f64-5717-4562-b3fc-2c963f66afa6","catalogue-item-1","Example listing","A useful summary","","3100","USD","https://example.test/listing",{},"draft",[]',
          },
          "application/yaml": {
            schema: text,
            example:
              '- id: 3fa85f64-5717-4562-b3fc-2c963f66afa6\n  retry_identity: listing:3fa85f64-5717-4562-b3fc-2c963f66afa6\n  external_key: catalogue-item-1\n  title: Example listing\n  short_description: A useful summary\n  long_description: ""\n  price_minor: "3100"\n  currency: USD\n  destination: https://example.test/listing\n  metadata: {}\n  state: draft\n  media: []',
          },
        },
      },
    };
  return {
    [status]: {
      description: "Application API response",
      content: { "application/json": { schema } },
    },
  };
}

const listingWriteSchema = object(
  {
    title: scalar("string", { minLength: 1 }),
    short_description: scalar("string", { maxLength: 200 }),
    long_description: text,
    price_minor: scalar("string", { pattern: "^\\d+$" }),
    currency: scalar("string", { minLength: 3, maxLength: 3 }),
    destination: scalar("string", { format: "uri" }),
    metadata: scalar("object", { additionalProperties: scalar("string") }),
    external_key: scalar("string", { maxLength: 128 }),
    featured_position: nullable(scalar("integer", { minimum: 1 })),
    state: scalar("string", { enum: ["draft", "published", "archived"] }),
    compare_at_price_minor: nullable(scalar("string", { pattern: "^\\d+$" })),
    visibility: scalar("string", { enum: ["public", "authenticated"] }),
    category_ids: list(uuid),
  },
  ["title", "price_minor", "currency", "destination"],
);
const integrationWriteSchema = object({ name: scalar("string", { minLength: 1, maxLength: 100 }) });
const requestBodyFor = (path: string, method: string) => {
  const key = `${method.toUpperCase()} ${path}`;
  const json = (schema: JsonSchema, required = true) => ({
    required,
    content: { "application/json": { schema } },
  });
  const multipart = (properties: Record<string, JsonSchema>) => ({
    required: true,
    content: { "multipart/form-data": { schema: object(properties) } },
  });
  const requests: Record<string, Record<string, unknown>> = {
    "POST /api/access/verify": json(
      object({ source: scalar("string", { minLength: 1, maxLength: 512 }) }),
    ),
    "POST /api/checkouts": json(object({ listing_id: uuid })),
    "POST /api/listings/{listingId}/integrations": json(integrationWriteSchema),
    "PATCH /api/listings/{listingId}/integrations/{integrationId}": json(integrationWriteSchema),
    "PATCH /api/listings/{listingId}/media/{mediaId}": json(
      object({
        alt_text: scalar("string", { maxLength: 500 }),
        position: scalar("integer", { minimum: 0 }),
      }),
    ),
    "POST /api/listings/{listingId}/media": multipart({
      file: scalar("string", { format: "binary" }),
      position: scalar("integer", { minimum: 0 }),
      alt_text: scalar("string", { maxLength: 500 }),
    }),
    "POST /api/listings": json(listingWriteSchema),
    "PATCH /api/listings/{listingId}": json(
      object(listingWriteSchema.properties as Record<string, JsonSchema>, []),
    ),
    "POST /api/listings/import": {
      required: true,
      content: {
        "application/json": { schema: list(listingTransferInputRecord) },
        "text/csv": {
          schema: text,
          example:
            'id,retry_identity,external_key,title,short_description,long_description,price_minor,currency,destination,metadata,state,media\n"3fa85f64-5717-4562-b3fc-2c963f66afa6","listing:3fa85f64-5717-4562-b3fc-2c963f66afa6","catalogue-item-1","Example listing","A useful summary","","3100","USD","https://example.test/listing",{},"draft",[]',
        },
        "application/yaml": {
          schema: text,
          example:
            '- id: 3fa85f64-5717-4562-b3fc-2c963f66afa6\n  retry_identity: listing:3fa85f64-5717-4562-b3fc-2c963f66afa6\n  external_key: catalogue-item-1\n  title: Example listing\n  short_description: A useful summary\n  long_description: ""\n  price_minor: "3100"\n  currency: USD\n  destination: https://example.test/listing\n  metadata: {}\n  state: draft\n  media: []',
        },
      },
    },
    "POST /api/purchases/reverse": json(
      object({ purchase_id: uuid, reason: scalar("string", { minLength: 3, maxLength: 500 }) }),
    ),
    "POST /api/earnings/settlement": json(
      object({ batch_size: scalar("integer", { minimum: 1, maximum: 1000, default: 100 }) }),
      false,
    ),
    "POST /api/referrals/parent": json(object({ parent_account_id: uuid })),
    "POST /api/funding-transactions": json(
      object(
        {
          amount_minor: scalar("string", { pattern: "^[1-9][0-9]*$" }),
          provider: scalar("string", { minLength: 1 }),
          payment_currency: scalar("string", { minLength: 1 }),
          bank_account_id: scalar("string", { minLength: 1 }),
        },
        ["amount_minor", "provider"],
      ),
    ),
    "POST /api/bank-transfer/funding-transactions/{fundingId}/evidence": multipart({
      transfer_reference: scalar("string", { maxLength: 200 }),
      customer_note: scalar("string", { maxLength: 2000 }),
      proof_file: scalar("string", { format: "binary" }),
    }),
    "POST /api/direct-trc20/funding-transactions/{fundingId}/transaction": json(
      object({
        transaction_hash: scalar("string", { pattern: "^(0x)?[a-fA-F0-9]{64}$" }),
      }),
    ),
    "POST /api/wallet/transfers": json(
      object({
        from: scalar("string", { enum: ["funding", "earnings"] }),
        to: scalar("string", { enum: ["funding", "earnings"] }),
        amount_minor: scalar("string", { pattern: "^[1-9]\\d*$" }),
      }),
    ),
    "POST /api/withdrawal-destinations": json(
      object({
        method: scalar("string", { minLength: 1, maxLength: 80 }),
        name: scalar("string", { minLength: 1, maxLength: 100 }),
        values: scalar("object", { additionalProperties: text }),
      }),
    ),
    "PATCH /api/withdrawal-destinations/{destinationId}": json({
      oneOf: [
        object({ status: scalar("string", { enum: ["archived"] }) }),
        object({
          name: scalar("string", { minLength: 1, maxLength: 100 }),
          values: scalar("object", { additionalProperties: text }),
        }),
      ],
    }),
  };
  return requests[key];
};

const queryParameters: Record<string, { name: string; schema: JsonSchema; required?: boolean }[]> =
  {
    "GET /api/checkouts": [
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 100 }) },
    ],
    "GET /api/checkout-quote": [{ name: "listing_id", schema: uuid, required: true }],
    "GET /api/listings": [
      { name: "featured", schema: scalar("boolean") },
      { name: "owner", schema: scalar("string", { enum: ["me"] }) },
      {
        name: "state",
        schema: scalar("string", { enum: ["draft", "published", "archived", "all"] }),
      },
      { name: "visibility", schema: scalar("string", { enum: ["public", "authenticated"] }) },
      { name: "search", schema: scalar("string", { maxLength: 200 }) },
      { name: "cursor", schema: scalar("string") },
      { name: "sort", schema: scalar("string", { enum: ["date", "price", "title", "rating"] }) },
      { name: "direction", schema: scalar("string", { enum: ["asc", "desc"] }) },
      { name: "limit", schema: scalar("integer", { minimum: 1 }) },
    ],
    "GET /api/listings/export": [
      {
        name: "format",
        schema: scalar("string", { enum: ["json", "csv", "yaml"], default: "json" }),
      },
    ],
    "POST /api/listings/import": [
      { name: "format", schema: scalar("string", { enum: ["json", "csv", "yaml"] }) },
      { name: "mode", schema: scalar("string", { enum: ["create", "upsert"], default: "create" }) },
    ],
    "GET /api/referrals/direct": [
      { name: "after", schema: scalar("string") },
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 100, default: 25 }) },
    ],
    "GET /api/referrals/downline": [
      { name: "depth", schema: scalar("integer", { minimum: 1 }), required: true },
      { name: "after", schema: scalar("string") },
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 100, default: 25 }) },
    ],
    "GET /api/referrals/uplines": [
      { name: "max_depth", schema: scalar("integer", { minimum: 1, default: 10 }) },
    ],
    "GET /api/wallet/funding/prepare": [
      {
        name: "amount_minor",
        schema: scalar("string", { pattern: "^[1-9][0-9]*$" }),
        required: true,
      },
      { name: "provider", schema: scalar("string", { minLength: 1 }), required: true },
      { name: "payment_currency", schema: scalar("string", { minLength: 1 }) },
      { name: "bank_account_id", schema: scalar("string", { minLength: 1 }) },
    ],
    "GET /api/wallet/transactions": [
      { name: "cursor", schema: scalar("string") },
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 50 }) },
    ],
    "GET /api/wallet/transfer-quote": [
      { name: "from", schema: scalar("string", { enum: ["funding", "earnings"] }), required: true },
      {
        name: "amount_minor",
        schema: scalar("string", { pattern: "^[1-9][0-9]*$" }),
        required: true,
      },
    ],
    "GET /api/funding-transactions": [
      {
        name: "state",
        schema: scalar("string", {
          enum: [
            "initialization_pending",
            "initializing",
            "awaiting_payment",
            "verification_pending",
            "confirmed",
            "failed",
            "blocked",
            "cancelled",
            "expired",
            "reconciliation_pending",
          ],
        }),
      },
      { name: "cursor", schema: scalar("string") },
      { name: "limit", schema: scalar("integer", { minimum: 1, maximum: 50, default: 20 }) },
      { name: "active", schema: scalar("boolean") },
    ],
  };
const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { error: { type: "string" }, code: { type: "string" } },
        required: ["error"],
      },
    },
  },
});

const authenticationResponsesByMode: Record<string, readonly string[]> = {
  anonymous: [],
  public: [],
  mixed: ["401", "403"],
  account: ["401", "403"],
  session_only: ["401", "403"],
  integration_credential: ["401"],
  deny: ["403"],
};
const authorizationResponseDescriptions: Record<string, string> = {
  "401": "Authentication required",
  "403": "Insufficient permissions",
};

type AccessMetadataBase = { security?: unknown };
const accessMetadataBases = new WeakMap<OpenApiOperation, AccessMetadataBase>();

function setAccess(
  operation: OpenApiOperation,
  access: { mode: string; scope?: string; capability?: string },
) {
  if (!accessMetadataBases.has(operation)) {
    accessMetadataBases.set(operation, {
      security: operation.security,
    });
  }
  const base = accessMetadataBases.get(operation)!;

  operation["x-authentication-mode"] = access.mode;
  if (access.mode === "anonymous" || access.mode === "mixed") operation["x-public-access"] = true;
  else delete operation["x-public-access"];
  if (access.capability) operation["x-session-capability"] = access.capability;
  else delete operation["x-session-capability"];
  if (access.scope) operation["x-required-api-scope"] = access.scope;
  else delete operation["x-required-api-scope"];

  if (access.mode === "mixed") {
    operation.security = access.scope ? [{}, { CliqeroApiKey: [] }] : [{}];
    return;
  }

  if (access.mode !== "account" && !access.scope) {
    if (base.security === undefined) delete operation.security;
    else operation.security = base.security;
    return;
  }

  operation.security = [{ CliqeroApiKey: [] }];
}

function addAuthenticationResponses(
  operation: OpenApiOperation,
  access: { mode: string; apiKey?: "allow" | "reject" },
) {
  const responses = (operation.responses ??= {}) as Record<string, unknown>;
  const statuses =
    access.mode === "anonymous" && access.apiKey === "reject"
      ? ["403"]
      : (authenticationResponsesByMode[access.mode] ?? []);
  for (const status of statuses)
    responses[status] ??= errorResponse(authorizationResponseDescriptions[status]);
}

function normalizeAuthorizationResponses(document: OpenApiDocument) {
  const genericDescriptions = new Set([
    "Request error",
    "Unauthorized",
    "Forbidden",
    "Not authorized",
  ]);

  for (const path of Object.values(document.paths))
    for (const operation of Object.values(path)) {
      const responses = operation.responses;
      if (!responses || typeof responses !== "object") continue;

      for (const [status, description] of Object.entries(authorizationResponseDescriptions)) {
        const response = (responses as Record<string, unknown>)[status];
        if (!response || typeof response !== "object") continue;
        const responseObject = response as Record<string, unknown>;
        if (
          typeof responseObject.description !== "string" ||
          genericDescriptions.has(responseObject.description)
        )
          responseObject.description = description;
      }
    }
}

const domainDescriptions: Record<string, string> = {
  Health: "Health checks report application availability without exposing persisted business data.",
  "Blog Posts": "Blog post operations preserve publication and editorial validation rules.",
  "Blog Categories": "Blog categories are independently managed persisted blog resources.",
  "Blog Tags": "Blog tags are independently exposed lookup records for blog content.",
  "Account Capabilities":
    "Account capability assignments are nested persisted resources managed through capability-administration authority.",
  "Listing Media": "Listing media operations enforce listing ownership and media validation.",
  "Listing Integrations":
    "Listing integration credentials are scoped to their owning listing; plaintext credentials are returned only when created or rotated.",
  "Catalogue Categories":
    "Catalogue categories are independently managed listing-classification resources.",
  Checkouts:
    "Checkout resource operations preserve payment, ownership, and purchase lifecycle invariants.",
  Distributions:
    "Distribution operations expose persisted distribution records under their own resource contract.",
  "Earning Entries":
    "Earning entry operations preserve accounting integrity and expose persisted entries under their own resource contract.",
  "Treasury Entries":
    "Treasury entries are persisted accounting records with audited root-only deletion.",
  "Treasury Adjustments":
    "Treasury adjustments use an idempotent accounting workflow and audited reconciliation.",
  "Package Entitlements":
    "Package entitlements are persisted access grants managed through their purchase and entitlement lifecycle.",
  Accounts:
    "Account operations use safe identity projections and enforce ownership or operator capability rules.",
  Listings:
    "Listing operations enforce seller ownership and the listing domain's supported lifecycle transitions.",
  Reviews:
    "Review operations preserve reviewer ownership and accept only supported moderation transitions.",
  Payments:
    "Payment resource operations expose provider-neutral records and preserve provider-owned payment facts.",
  "Payment Events":
    "Payment Event records preserve provider identity, deduplication keys, and immutable ingress evidence.",
  "Payment Reconciliation":
    "Payment reconciliation lists candidates and coordinates explicit verification attempts.",
  "Checkout Quote": "A checkout quote is a read-only price and wallet-availability projection.",
  Purchases: "Purchase operations preserve payment, ownership, and purchase lifecycle rules.",
  "Wallet Summary": "The wallet summary is a computed, account-scoped balance projection.",
  "Wallet Transactions":
    "Wallet transactions are a read-only projection of posted account movements.",
  "Wallet Transfers": "Wallet transfers preserve the atomic transfer, earnings, and Treasury legs.",
  "Wallet Transfer Quote": "A wallet transfer quote is a read-only fee and net-amount calculation.",
  "Funding Transactions":
    "Provider-neutral funding transactions are persisted and processed idempotently.",
  "Administrative Funding":
    "Administrative funding records are distinct mutable records backed by audited balance adjustments.",
  "Funding Preparation":
    "Funding preparation returns provider-neutral eligibility and amount projections.",
  "Bank Transfer Evidence":
    "Bank Transfer evidence submission is a provider-owned protocol operation tied to an existing funding transaction.",
  "Direct TRC20 Verification":
    "Direct TRC20 transaction submission is a provider-owned verification operation tied to an existing funding transaction.",
  Withdrawals:
    "Withdrawal operations enforce account ownership, reserved-balance, and supported management transitions.",
  "Withdrawal Policy":
    "Withdrawal policy is a configured platform projection, not a persisted resource.",
  "Withdrawal Destinations":
    "Saved payout destinations are account-owned mutable resources; DELETE removes only the saved destination while historical withdrawal snapshots remain intact.",
  Hierarchy:
    "Hierarchy operations return only relationships authorized for the authenticated account or hierarchy manager.",
  Referrals:
    "Referral operations use the live referral graph and preserve attribution and authorization rules.",
  "Treasury Summary":
    "The Treasury summary is a computed projection over immutable accounting entries.",
  "Access Verification":
    "Access verification checks a purchase or entitlement without exposing unrelated account data.",
  "Earnings Summary": "Earnings is a computed, account-scoped balance and activity projection.",
  "Distribution Policy":
    "Distribution policy is a configured policy projection, not a persisted resource.",
  "Withdrawal Methods": "Withdrawal methods are a configured payout-method projection.",
  "Referral Network":
    "Referral operations expose authorized relationship queries and parent-management workflows.",
};

function domainForPath(path: string): string {
  if (path.startsWith("/api/withdrawal-destinations")) return "Withdrawal Destinations";
  if (path === "/api/withdrawals/policy") return "Withdrawal Policy";
  if (path === "/api/withdrawal-methods") return "Withdrawal Methods";
  if (path === "/api/health") return "Health";
  if (path === "/api/access/verify") return "Access Verification";
  if (path.startsWith("/api/blog/posts")) return "Blog Posts";
  if (path.startsWith("/api/blog/categories")) return "Blog Categories";
  if (path.startsWith("/api/blog/tags")) return "Blog Tags";
  if (/^\/api\/accounts\/\{accountId\}\/capabilities/.test(path)) return "Account Capabilities";
  if (path.startsWith("/api/webhooks/") || path.includes("/ipn")) return "Payment Webhooks";
  if (path === "/api/package-entitlements" || path.startsWith("/api/package-entitlements/"))
    return "Package Entitlements";
  const relative = path.replace(/^\/api\//, "");
  if (relative.startsWith("accounts")) return "Accounts";
  if (relative.includes("integrations")) return "Listing Integrations";
  if (relative.includes("/media") || relative.endsWith("/media")) return "Listing Media";
  if (relative.startsWith("catalogue/categories")) return "Catalogue Categories";
  if (relative.startsWith("catalogue")) return "Catalogue";
  if (relative.startsWith("listings")) return "Listings";
  if (relative.startsWith("blog")) return "Blog Posts";
  if (relative.startsWith("reviews")) return "Reviews";
  if (relative.startsWith("payment-events")) return "Payment Events";
  if (relative === "payments/reconcile") return "Payment Reconciliation";
  if (relative.startsWith("payments")) return "Payments";
  if (relative.startsWith("purchases")) return "Purchases";
  if (relative === "checkout-quote") return "Checkout Quote";
  if (relative === "checkouts" || relative.startsWith("checkouts/")) return "Checkouts";
  if (relative === "funding") return "Administrative Funding";
  if (relative.startsWith("funding/")) return "Administrative Funding";
  if (relative === "wallet") return "Wallet Summary";
  if (relative === "wallet/transactions") return "Wallet Transactions";
  if (relative === "wallet/transfers" || relative.startsWith("wallet/transfers/"))
    return "Wallet Transfers";
  if (relative === "wallet/transfer-quote") return "Wallet Transfer Quote";
  if (relative === "wallet/funding/prepare") return "Funding Preparation";
  if (relative.startsWith("bank-transfer/funding-transactions/")) return "Bank Transfer Evidence";
  if (relative.startsWith("direct-trc20/funding-transactions/")) return "Direct TRC20 Verification";
  if (relative === "funding-transactions" || relative.startsWith("funding-transactions/"))
    return "Funding Transactions";
  if (relative.startsWith("withdrawal")) return "Withdrawals";
  if (relative.startsWith("hierarchy")) return "Hierarchy";
  if (relative.startsWith("referral")) return "Referral Network";
  if (relative.startsWith("treasury/entries")) return "Treasury Entries";
  if (relative.startsWith("treasury/adjustments")) return "Treasury Adjustments";
  if (relative === "treasury") return "Treasury Summary";
  if (relative.startsWith("earnings/entries")) return "Earning Entries";
  if (relative.startsWith("distributions")) return "Distributions";
  if (relative === "earnings") return "Earnings Summary";
  if (relative === "distribution-policy") return "Distribution Policy";
  if (relative === "earnings/settlement") return "Earnings Settlement";
  throw new Error(`Public OpenAPI operation has no explicit owner: ${path}`);
}

function readableResource(path: string) {
  const segments = path
    .replace(/^\/api\//, "")
    .split("/")
    .filter((segment) => segment && !/^\{.+\}$/.test(segment));
  const last = segments.at(-1) ?? "API operation";
  const singular = last.endsWith("ies")
    ? `${last.slice(0, -3)}y`
    : last.endsWith("s")
      ? last.slice(0, -1)
      : last;
  return singular.replaceAll("-", " ");
}

function readableCollection(path: string) {
  const segments = path
    .replace(/^\/api\//, "")
    .split("/")
    .filter((segment) => segment && !/^\{.+\}$/.test(segment));
  return (segments.at(-1) ?? "resources").replaceAll("-", " ");
}

function operationSummary(path: string, method: string) {
  const resource = readableResource(path);
  if (path === "/api/health") return "Check API health";
  if (path === "/api/wallet") return "Get wallet summary";
  if (path === "/api/access/verify") return "Verify purchase access";
  if (path === "/api/referrals/direct") return "List direct referrals";
  if (path === "/api/referrals/downline") return "List referrals at a selected level";
  if (path === "/api/referrals/uplines") return "List account uplines";
  if (path === "/api/referrals/account-url") return "Get account referral URL";
  if (path === "/api/listings/{listingId}/access") return "Open listing access handoff";
  if (path === "/api/listings/{listingId}/referral-url") return "Get listing referral URL";
  if (path === "/api/listings/export") return "Export listings";
  if (path === "/api/listings/import") return "Import listings";
  if (path === "/api/checkout-quote") return "Quote checkout wallet requirement";
  if (path === "/api/wallet/funding/prepare") return "Prepare a funding option";
  if (path === "/api/wallet/transfer-quote") return "Quote a wallet transfer";
  if (path === "/api/earnings") return "Get earnings summary";
  if (path === "/api/distribution-policy") return "Get distribution policy";
  if (path === "/api/withdrawal-methods") return "List available withdrawal methods";
  if (path === "/api/withdrawals/policy") return "Get withdrawal policy";
  if (path === "/api/referrals/parent") return "Set an account's referral parent";
  if (path.endsWith("/reverse")) return "Reverse a purchase";
  if (path.endsWith("/settlement")) return "Settle earnings";
  if (path.endsWith("/reconcile"))
    return method === "get" ? "List payment reconciliation candidates" : "Reconcile a payment";
  if (path.endsWith("/rotate")) return "Rotate integration credential";
  if (path.startsWith("/api/withdrawals/") && path.endsWith("/cancel"))
    return "Cancel a withdrawal";
  if (path.endsWith("/verify"))
    return path.includes("/fund") ? "Verify funding" : "Verify resource status";
  if (path.endsWith("/cancel")) return "Cancel funding";
  if (path.endsWith("/pay")) return "Pay for checkout";
  if (path.endsWith("/transaction")) return "Submit funding transaction";
  if (path.endsWith("/evidence")) return "Submit funding evidence";
  if (path.endsWith("/initialize")) return "Initialize funding";
  if (path.endsWith("/import")) return "Import listings";
  if (path.endsWith("/export")) return "Export listings";
  if (path.endsWith("/confirm-bank-transfer")) return "Confirm bank transfer funding";
  if (method === "get")
    return /^.*\/\{[^/]+\}$/.test(path) ? `Get ${resource}` : `List ${readableCollection(path)}`;
  if (method === "post") return `Create ${resource}`;
  if (method === "patch" || method === "put")
    return domainForPath(path).startsWith("Reviews") ? "Moderate a review" : `Update ${resource}`;
  if (method === "delete") return `Delete ${resource}`;
  return `Use ${resource}`;
}

function describeParameter(name: string) {
  const descriptions: Record<string, string> = {
    cursor: "Opaque cursor returned by the previous page; omit it to start at the first page.",
    limit: "Maximum number of records to return in this page.",
    state: "Requested lifecycle state; only domain-supported transitions are accepted.",
    status: "Requested status; only domain-supported transitions are accepted.",
    provider: "Provider identifier used to filter or route provider-neutral payment work.",
    listingId: "ID of the listing that owns this resource or integration.",
    integrationId: "ID of the integration associated with the listing in this URL.",
    accountId: "ID of the account being addressed.",
    reviewId: "ID of the review being moderated.",
    id: "ID of the resource being addressed.",
    search: "Optional text used to filter matching records.",
    visibility: "Listing visibility used to filter results or update the listing.",
  };
  return (
    descriptions[name] ??
    `The ${name.replaceAll(/([A-Z])/g, " $1").toLowerCase()} value for this operation.`
  );
}

function describeBodyField(name: string) {
  const descriptions: Record<string, string> = {
    state:
      "Requested lifecycle state. The domain validates whether the current state may transition to it.",
    status:
      "Requested status. Only the resource's supported status values and transitions are accepted.",
    visibility: "Controls who may discover or access the listing.",
    provider: "Identifies the payment provider that owns verification for this record.",
    name: "Human-readable name shown for this resource.",
    listingId: "ID of the listing that owns the integration.",
    listing_id: "ID of the listing that owns the integration.",
    cursor: "Opaque cursor returned by the previous page.",
    limit: "Maximum number of records to return.",
  };
  return descriptions[name];
}

function describeResponse(status: string, summary: string, path: string) {
  const resource = readableResource(path);
  const label = resource.charAt(0).toUpperCase() + resource.slice(1);
  if (status === "200") return `${summary} succeeded`;
  if (status === "201") return `${label} created successfully`;
  if (status === "207") return "Import completed with per-record results";
  if (status === "204") return `${label} operation completed successfully`;
  if (status === "400" || status === "422") return `Invalid ${resource} request`;
  if (status === "401") return "Authentication required";
  if (status === "403") return "Insufficient permissions";
  if (status === "404") return `${label} not found`;
  if (status === "409") return `${label} conflicts with its current state or existing data`;
  return `Request failed while attempting to ${summary.toLowerCase()}`;
}

function enrichOperation(path: string, method: string, operation: OpenApiOperation) {
  const tag = domainForPath(path);
  operation.tags = [tag];
  const summary =
    typeof operation.summary === "string" && operation.summary.trim()
      ? operation.summary
      : operationSummary(path, method);
  operation.summary = summary;
  if (typeof operation.description !== "string" || !operation.description.trim()) {
    operation.description = `${summary}. ${domainDescriptions[tag] ?? ""}`.trim();
  }

  const requestContract = requestBodyFor(path, method);
  if (requestContract && !operation.requestBody)
    operation.requestBody = { ...requestContract, description: `${summary} request.` };

  const parameters = Array.isArray(operation.parameters)
    ? (operation.parameters as Record<string, unknown>[])
    : [];
  for (const parameter of queryParameters[`${method.toUpperCase()} ${path}`] ?? [])
    if (!parameters.some((current) => current.in === "query" && current.name === parameter.name))
      parameters.push({
        ...parameter,
        in: "query",
        description: describeParameter(parameter.name),
      });
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (!parameters.some((parameter) => parameter.in === "path" && parameter.name === name))
      parameters.push({
        name,
        in: "path",
        required: true,
        description: describeParameter(name),
        schema: { type: "string" },
      });
  }
  if (parameters.length) operation.parameters = parameters;

  if (Array.isArray(operation.parameters))
    for (const parameter of operation.parameters) {
      if (parameter && typeof parameter === "object") {
        const item = parameter as Record<string, unknown>;
        if (typeof item.name === "string" && !item.description)
          item.description = describeParameter(item.name);
      }
    }

  const requestBody = operation.requestBody;
  if (requestBody && typeof requestBody === "object") {
    const content = (requestBody as Record<string, unknown>).content;
    if (content && typeof content === "object")
      for (const media of Object.values(content)) {
        if (!media || typeof media !== "object") continue;
        const schema = (media as Record<string, unknown>).schema;
        if (!schema || typeof schema !== "object") continue;
        const properties = (schema as Record<string, unknown>).properties;
        if (!properties || typeof properties !== "object") continue;
        for (const [name, field] of Object.entries(properties)) {
          if (!field || typeof field !== "object") continue;
          const description = describeBodyField(name);
          if (description && !(field as Record<string, unknown>).description)
            (field as Record<string, unknown>).description = description;
        }
      }
  }

  const responses = operation.responses;
  if (responses && typeof responses === "object") {
    for (const [status, response] of Object.entries(responses)) {
      if (!response || typeof response !== "object") continue;
      const item = response as Record<string, unknown>;
      if (item.description === "Application API response" || item.description === "Request error") {
        item.description = describeResponse(status, summary, path);
      }
      const content = item.content;
      if (!content || typeof content !== "object") continue;
      for (const media of Object.values(content)) {
        if (!media || typeof media !== "object") continue;
        const mediaObject = media as Record<string, unknown>;
        const schema = mediaObject.schema;
        if (schema && typeof schema === "object" && !mediaObject.examples && !mediaObject.example) {
          const example = syntheticExample(schema as Record<string, unknown>);
          if (example !== undefined) mediaObject.examples = { example: { value: example } };
        }
      }
    }
  }

  if (requestBody && typeof requestBody === "object") {
    const content = (requestBody as Record<string, unknown>).content;
    if (content && typeof content === "object")
      for (const media of Object.values(content)) {
        if (!media || typeof media !== "object") continue;
        const mediaObject = media as Record<string, unknown>;
        const schema = mediaObject.schema;
        if (schema && typeof schema === "object" && !mediaObject.examples && !mediaObject.example) {
          const example = syntheticExample(schema as Record<string, unknown>);
          if (example !== undefined) mediaObject.examples = { example: { value: example } };
        }
      }
  }
}

function syntheticExample(schema: Record<string, unknown>, propertyName = ""): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (Array.isArray(schema.oneOf) && schema.oneOf.length)
    return syntheticExample(schema.oneOf[0] as Record<string, unknown>, propertyName);
  if (Array.isArray(schema.anyOf) && schema.anyOf.length)
    return syntheticExample(schema.anyOf[0] as Record<string, unknown>, propertyName);
  if (
    schema.type === "object" &&
    (!schema.properties || typeof schema.properties !== "object") &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  )
    return { example: syntheticExample(schema.additionalProperties as Record<string, unknown>) };
  if (schema.type === "object" && schema.properties && typeof schema.properties === "object") {
    return Object.fromEntries(
      Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(
        ([name, child]) => [name, syntheticExample(child, name)],
      ),
    );
  }
  if (schema.type === "array") {
    const items = schema.items;
    return [
      items && typeof items === "object"
        ? syntheticExample(items as Record<string, unknown>)
        : "example",
    ];
  }
  if (schema.type === "string") {
    if (schema.format === "uuid") return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    if (schema.format === "date-time") return "2026-10-04T01:00:00.000Z";
    if (schema.format === "email") return "operator@example.test";
    if (schema.format === "uri" || schema.format === "url") return "https://example.test/resource";
    if (propertyName.includes("amount") || propertyName.endsWith("_minor")) return "3100";
    if (propertyName.includes("currency")) return "USD";
    if (propertyName.includes("username")) return "example_user";
    if (propertyName.includes("state")) return "pending";
    if (propertyName.includes("provider")) return "paystack";
    if (propertyName.includes("reference")) return "pay-example-reference";
    if (propertyName.includes("url")) return "https://example.test/resource";
    if (propertyName.includes("id")) return "example-id";
    return "example";
  }
  if (schema.type === "integer" || schema.type === "number")
    return typeof schema.minimum === "number" ? schema.minimum : 1;
  if (schema.type === "boolean") return true;
  return undefined;
}

/** Adds compatibility and capability metadata without capability policy in the API composition root. */
export function applyOpenApiMetadata(
  document: OpenApiDocument,
  legacyRoutes: readonly LegacyRoute[],
  contributions: readonly (readonly OpenApiMetadataEntry[])[],
) {
  document.components ??= {};
  document.components.securitySchemes ??= {};
  document.components.securitySchemes.CliqeroApiKey = {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Cliqero API Key",
    description:
      "Use an existing Cliqero API key as Authorization: Bearer <key>. Operations may require different scopes; each required scope is exposed through x-required-api-scope.",
  };

  for (const route of legacyRoutes) {
    const path = (document.paths[route.path] ??= {});
    for (const routeMethod of route.methods) {
      const method = routeMethod.method.toLowerCase();
      const operation = (path[method] ??= {
        responses: {
          ...response(route.path, method),
          "400": errorResponse("Request error"),
          "404": errorResponse("Request error"),
        },
      });
      setAccess(operation, routeMethod.access);
      addAuthenticationResponses(operation, routeMethod.access);
    }
  }

  for (const contribution of contributions)
    for (const entry of contribution) {
      const operation = document.paths[entry.path]?.[entry.method.toLowerCase()];
      if (operation) {
        setAccess(operation, entry);
        addAuthenticationResponses(operation, entry);
      }
    }

  applyResponseSchemaOverrides(document);

  const tagNames = new Set<string>();
  for (const [path, pathItem] of Object.entries(document.paths))
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      enrichOperation(path, method, operation);
      tagNames.add(String((operation.tags as string[])[0]));
    }
  (document as Record<string, unknown>).tags = [...tagNames].sort().map((name) => ({
    name,
    description: domainDescriptions[name] ?? "Public API operations for this concern.",
  }));

  normalizeAuthorizationResponses(document);
}
