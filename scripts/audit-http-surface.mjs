const base = process.env.APP_URL ?? "http://127.0.0.1:3000";
const headers = { accept: "application/json" };
if (process.env.OPENAPI_KEY) headers["x-openapi-key"] = process.env.OPENAPI_KEY;

const response = await fetch(new URL("/api/openapi.json", base), {
  headers,
});
if (!response.ok) throw new Error(`OpenAPI returned HTTP ${response.status}`);

const document = await response.json();
const paths = Object.keys(document.paths ?? {});
const forbidden = paths.filter(
  (path) => path.startsWith("/api/operator/") || path.startsWith("/internal/"),
);
if (forbidden.length)
  throw new Error(`Private paths leaked into external OpenAPI: ${forbidden.join(", ")}`);

const required = [
  "/api/health",
  "/api/listings",
  "/api/wallet",
  "/api/purchases",
  "/api/withdrawals",
  "/api/hierarchy/tree",
];
const missing = required.filter((path) => !document.paths?.[path]);
if (missing.length)
  throw new Error(`Canonical API paths missing from OpenAPI: ${missing.join(", ")}`);

const health = await fetch(new URL("/api/health", base));
if (!health.ok) throw new Error(`/api/health returned HTTP ${health.status}`);

console.log(
  `Read-only HTTP surface audit passed (${paths.length} OpenAPI paths; ${required.length} canonical paths checked).`,
);
