import type { ObjectLocator, ObjectStorageProvider } from "@/modules/storage/object-storage";
export class SupabaseObjectStorageProvider implements ObjectStorageProvider {
  readonly name = "supabase";
  constructor(
    private endpoint: string,
    private bucket: string,
    private serviceKey: string,
    private transport: typeof fetch = fetch,
  ) {}
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
    return `${this.endpoint.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(locator.container)}/${locator.key.split("/").map(encodeURIComponent).join("/")}`;
  }
}
