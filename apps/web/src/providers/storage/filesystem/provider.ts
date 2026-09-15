import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ObjectLocator, ObjectStorageProvider } from "@/modules/storage/object-storage";
export class FilesystemObjectStorageProvider implements ObjectStorageProvider {
  readonly visibility: "public" | "private";
  private root: string;
  constructor(
    readonly name: string,
    root: string,
    private publicBaseUrl: string | undefined,
    private container = "media",
    visibility: "public" | "private" = "public",
  ) {
    this.visibility = visibility;
    this.root = resolve(root);
  }
  private path(key: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) || key.includes(".."))
      throw new Error("Unsafe object key");
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(this.root + sep))
      throw new Error("Object key escapes storage root");
    return path;
  }
  async put(input: { key: string; bytes: Uint8Array; mimeType: string }) {
    const path = this.path(input.key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, input.bytes, { flag: "wx" });
    return {
      provider: this.name,
      container: this.container,
      key: input.key,
      byteSize: input.bytes.byteLength,
      mimeType: input.mimeType,
    };
  }
  async delete(locator: ObjectLocator) {
    await rm(this.path(locator.key), { force: true });
  }
  publicUrl(locator: ObjectLocator) {
    if (this.visibility !== "public" || !this.publicBaseUrl)
      throw new Error(`Object storage instance is not publicly addressable: ${this.name}`);
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${locator.key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async read(locator: ObjectLocator) {
    return {
      bytes: new Uint8Array(await readFile(this.path(locator.key))),
      mimeType: "application/octet-stream",
    };
  }
}
