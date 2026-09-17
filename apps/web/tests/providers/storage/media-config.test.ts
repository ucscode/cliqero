import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMediaStorage } from "@/providers/storage/media-config";

const environment: Record<string, string | undefined> = {
  APP_URL: "http://localhost:3000",
  MEDIA_ROOT: "/tmp/cliqero-media",
};

describe("media storage configuration", () => {
  it("accepts arbitrary instance names and resolves the default by instance identity", () => {
    const registry = loadMediaStorage("config/storage/media.example.yaml", environment);

    expect(registry.names()).toEqual(["filesystem", "supabase", "cloudflare"]);
    expect(registry.default().name).toBe("filesystem");
    expect(registry.get("supabase").visibility).toBe("private");
  });

  it("registers every declared instance without an enabled flag", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-storage-config-"));
    try {
      const base = `
providers:
  custom_media:
    provider: filesystem
    visibility: public
    config:
      root: /tmp/cliqero-media
      container: media
      public_base_url: http://localhost:3000/media/local_public
      `;
      const custom = join(root, "custom.yaml");
      await writeFile(custom, `default_provider: custom_media${base}`);
      expect(loadMediaStorage(custom, environment).names()).toEqual(["custom_media"]);

      const missing = join(root, "missing.yaml");
      await writeFile(missing, `default_provider: absent${base}`);
      expect(() => loadMediaStorage(missing, environment)).toThrow(
        "default_provider must reference a configured storage instance",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not parse or materialize malformed non-default instances until selected", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-storage-config-"));
    try {
      const config = join(root, "config.yaml");
      await writeFile(
        config,
        `default_provider: local_files
providers:
  local_files:
    provider: filesystem
    visibility: private
    config:
      root: /tmp/cliqero-media
  broken_supabase:
    provider: supabase
    visibility: private
    config:
      endpoint: not-a-url
      bucket: evidence
      service_key: broken
`,
      );
      const registry = loadMediaStorage(config, environment);
      expect(registry.default().name).toBe("local_files");
      expect(() => registry.get("broken_supabase")).toThrow(
        "Storage configuration is invalid: broken_supabase",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the filesystem instance name as container identity when container is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-storage-config-"));
    try {
      const storageRoot = join(root, "objects");
      const config = join(root, "config.yaml");
      await writeFile(
        config,
        `default_provider: local_files\nproviders:\n  local_files:\n    provider: filesystem\n    visibility: private\n    config:\n      root: ${storageRoot}\n`,
      );
      const registry = loadMediaStorage(config, environment);
      const stored = await registry.default().put({
        key: "proofs/test.png",
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
      });
      expect(stored.container).toBe("local_files");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["public filesystem", "filesystem", "root: /tmp/cliqero-media\n      container: media"],
    [
      "public R2",
      "cloudflare-r2",
      "endpoint: https://account.r2.cloudflarestorage.com\n      bucket: media\n      access_key_id: id\n      secret_access_key: secret",
    ],
  ])("rejects a %s instance without a public URL", async (_label, provider, providerConfig) => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-storage-config-"));
    try {
      const config = join(root, "config.yaml");
      await writeFile(
        config,
        `default_provider: media\nproviders:\n  media:\n    provider: ${provider}\n    visibility: public\n    config:\n      ${providerConfig}\n`,
      );
      expect(() => loadMediaStorage(config, environment)).toThrow(
        "Public storage instances must define public_base_url",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows private filesystem and R2 instances without public URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-storage-config-"));
    try {
      const config = join(root, "config.yaml");
      await writeFile(
        config,
        `default_provider: private_files\nproviders:\n  private_files:\n    provider: filesystem\n    visibility: private\n    config:\n      root: /tmp/cliqero-media\n  private_files_with_url:\n    provider: filesystem\n    visibility: private\n    config:\n      root: /tmp/cliqero-media\n      public_base_url: https://media.example.com\n  private_r2:\n    provider: cloudflare-r2\n    visibility: private\n    config:\n      endpoint: https://account.r2.cloudflarestorage.com\n      bucket: evidence\n      access_key_id: id\n      secret_access_key: secret\n`,
      );
      const registry = loadMediaStorage(config, environment);
      expect(registry.names()).toEqual(["private_files", "private_files_with_url", "private_r2"]);
      expect(() =>
        registry.publicUrl({ provider: "private_files", container: "media", key: "x" }),
      ).toThrow("private");
      expect(() =>
        registry.publicUrl({ provider: "private_files_with_url", container: "media", key: "x" }),
      ).toThrow("private");
      expect(() =>
        registry.publicUrl({ provider: "private_r2", container: "evidence", key: "x" }),
      ).toThrow("private");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps private R2 private even when a public URL is configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-storage-config-"));
    try {
      const config = join(root, "config.yaml");
      await writeFile(
        config,
        `default_provider: private_r2\nproviders:\n  private_r2:\n    provider: cloudflare-r2\n    visibility: private\n    config:\n      endpoint: https://account.r2.cloudflarestorage.com\n      bucket: evidence\n      public_base_url: https://media.example.com\n      access_key_id: id\n      secret_access_key: secret\n`,
      );
      const registry = loadMediaStorage(config, environment);
      expect(() =>
        registry.publicUrl({ provider: "private_r2", container: "evidence", key: "x" }),
      ).toThrow("private");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses Supabase visibility to control public URL access", async () => {
    const root = await mkdtemp(join(tmpdir(), "cliqero-storage-config-"));
    try {
      const config = join(root, "config.yaml");
      await writeFile(
        config,
        `default_provider: supabase_public\nproviders:\n  supabase_public:\n    provider: supabase\n    visibility: public\n    config:\n      endpoint: https://project.supabase.co\n      bucket: public-media\n      service_key: secret\n  supabase_private:\n    provider: supabase\n    visibility: private\n    config:\n      endpoint: https://project.supabase.co\n      bucket: private-media\n      service_key: secret\n`,
      );
      const registry = loadMediaStorage(config, environment);
      expect(
        registry.publicUrl({ provider: "supabase_public", container: "public-media", key: "x" }),
      ).toContain("/object/public/public-media/");
      expect(() =>
        registry.publicUrl({ provider: "supabase_private", container: "private-media", key: "x" }),
      ).toThrow("private");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
