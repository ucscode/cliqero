import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ObjectLocator, ObjectStorageProvider } from "@/modules/listing-media/storage";
export class FilesystemObjectStorageProvider implements ObjectStorageProvider {
  readonly name = "filesystem";
  private root: string;
  constructor(
    root: string,
    private publicBaseUrl: string,
    private container = "listing-media",
  ) {
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
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${locator.key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async read(locator: ObjectLocator) {
    return {
      bytes: new Uint8Array(await readFile(this.path(locator.key))),
      mimeType: "application/octet-stream",
    };
  }
}
