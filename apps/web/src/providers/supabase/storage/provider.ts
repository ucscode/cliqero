import type { ObjectLocator, ObjectStorageProvider } from "@/modules/storage/object-storage";
export class SupabaseObjectStorageProvider implements ObjectStorageProvider {
  readonly visibility: "public" | "private";
  constructor(
    readonly name: string,
    private endpoint: string,
    private bucket: string,
    private serviceKey: string,
    visibility: "public" | "private" = "public",
    private transport: typeof fetch = fetch,
  ) {
    this.visibility = visibility;
  }
  private objectUrl(key: string) {
    return `${this.endpoint.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(this.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async put(input: { key: string; bytes: Uint8Array; mimeType: string }) {
    const response = await this.transport(this.objectUrl(input.key), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        "content-type": input.mimeType,
        "x-upsert": "false",
      },
      body: Buffer.from(input.bytes),
    });
    if (!response.ok) throw new Error(`Supabase storage upload failed (${response.status})`);
    return {
      provider: this.name,
      container: this.bucket,
      key: input.key,
      byteSize: input.bytes.byteLength,
      mimeType: input.mimeType,
    };
  }
  async delete(locator: ObjectLocator) {
    const response = await this.transport(
      `${this.endpoint.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(locator.container)}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${this.serviceKey}`,
          apikey: this.serviceKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prefixes: [locator.key] }),
      },
    );
    if (!response.ok && response.status !== 404)
      throw new Error(`Supabase storage deletion failed (${response.status})`);
  }
  publicUrl(locator: ObjectLocator) {
    if (this.visibility !== "public")
      throw new Error(`Object storage instance is not publicly addressable: ${this.name}`);
    return `${this.endpoint.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(locator.container)}/${locator.key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async read(locator: ObjectLocator) {
    const response = await this.transport(this.objectUrl(locator.key), {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
      },
    });
    if (!response.ok) throw new Error(`Supabase storage read failed (${response.status})`);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}
