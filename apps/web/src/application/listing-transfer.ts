import { createHash } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type { Account } from "@/modules/identity/account";
import type { ListingState } from "@/modules/listing/listing";
import type { ListingService } from "@/application/listings";
import type { ListingMediaService } from "@/application/listing-media";
import type { ListingMedia, ListingMediaRepository } from "@/modules/listing-media/media";
import { fetchRemoteImage } from "@/application/remote-image";

const mediaSchema = z
  .object({
    media_id: z.uuid().optional(),
    transfer_identity: z.string().min(1).max(200).optional(),
    url: z.url(),
    alt_text: z.string().max(500).default(""),
    position: z.number().int().min(0),
  })
  .strict();
const recordSchema = z
  .object({
    id: z.uuid().optional(),
    retry_identity: z
      .string()
      .regex(/^listing:[0-9a-f-]{36}$/i)
      .optional(),
    external_key: z.string().max(128).optional(),
    title: z.string().min(1),
    description: z.string().default(""),
    price_minor: z.string().regex(/^[0-9]+$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    destination: z.url(),
    metadata: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .default({}),
    state: z.enum(["draft", "published", "archived"]).default("draft"),
    media: z.array(mediaSchema).max(20).default([]),
  })
  .strict();
export type ListingTransferRecord = z.infer<typeof recordSchema>;
export type TransferFormat = "json" | "csv" | "yaml";
type Downloaded = Awaited<ReturnType<typeof fetchRemoteImage>>;

export class ListingTransferService {
  constructor(
    private listings: ListingService,
    private media: ListingMediaService,
    private mediaRepository: ListingMediaRepository,
    private remoteImage: typeof fetchRemoteImage = fetchRemoteImage,
  ) {}
  async export(owner: Account) {
    return this.exportInternal(owner, false);
  }
  async exportCatalogue(owner: Account) {
    return this.exportInternal(owner, true);
  }
  private async exportInternal(owner: Account, catalogue: boolean) {
    const records: ListingTransferRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = catalogue
        ? await this.listings.queryCatalogue({ cursor, limit: 100 })
        : await this.listings.queryOwner(owner, { cursor, limit: 100 });
      const media = await this.mediaRepository.listByListings(page.items.map((item) => item.id));
      for (const listing of page.items)
        records.push({
          id: listing.id,
          external_key: listing.externalKey ?? undefined,
          title: listing.title,
          description: listing.description,
          price_minor: listing.price.minorAmount.toString(),
          currency: listing.price.currency,
          destination: listing.destination,
          metadata: { ...listing.metadata },
          state: listing.state,
          media: (media.get(listing.id) ?? []).map((item) => ({
            media_id: item.id,
            transfer_identity: item.transferIdentity ?? `media:${item.id}`,
            url: this.media.publicUrl(item),
            alt_text: item.altText,
            position: item.position,
          })),
        });
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return records;
  }
  async import(
    owner: Account,
    input: { format: TransferFormat; body: string; mode: "create" | "upsert" },
  ) {
    return this.importInternal(owner, input, false);
  }
  async importCatalogue(
    owner: Account,
    input: { format: TransferFormat; body: string; mode: "create" | "upsert" },
  ) {
    return this.importInternal(owner, input, true);
  }
  private async importInternal(
    owner: Account,
    input: { format: TransferFormat; body: string; mode: "create" | "upsert" },
    catalogue: boolean,
  ) {
    const raw = parseTransfer(input.body, input.format);
    if (!Array.isArray(raw) || raw.length > 1000)
      throw new Error("Import must contain a list of at most 1000 listings");
    const result = {
      total: raw.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      records: [] as ImportRecordResult[],
    };
    for (let index = 0; index < raw.length; index++) {
      let durableListingId: string | undefined;
      const newlyCreatedMedia: string[] = [];
      try {
        const record = recordSchema.parse(raw[index]);
        let existing = await this.resolveExisting(owner, record, input.mode, catalogue);
        const active = existing
          ? (await this.mediaRepository.listByListing(existing.id)).filter(
              (item) => item.state === "active",
            )
          : [];
        const desired = record.media
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((item, index) => ({ ...item, position: index, identity: mediaIdentity(item) }));
        if (new Set(desired.map((item) => item.identity)).size !== desired.length)
          throw new Error("media: duplicate transfer identity");
        const existingByIdentity = new Map(
          active.flatMap(
            (item) =>
              [
                [item.transferIdentity, item],
                [`media:${item.id}`, item],
              ].filter((entry) => entry[0]) as [string, ListingMedia][],
          ),
        );
        const downloads = new Map<string, Downloaded>();
        for (const item of desired)
          if (!existingByIdentity.has(item.identity))
            downloads.set(item.identity, await this.remoteImage(item.url));
        const created = !existing;
        let listing;
        if (existing) {
          listing = catalogue
            ? await this.listings.updateCatalogue(owner, existing.id, {
                title: record.title,
                description: record.description,
                priceMinor: record.price_minor,
                currency: record.currency,
                destination: record.destination,
                metadata: record.metadata,
              })
            : await this.listings.update(owner, existing.id, {
                title: record.title,
                description: record.description,
                priceMinor: record.price_minor,
                currency: record.currency,
                destination: record.destination,
                metadata: record.metadata,
              });
        } else {
          listing = catalogue
            ? await this.listings.createCatalogue(owner, {
                title: record.title,
                description: record.description,
                priceMinor: record.price_minor,
                currency: record.currency,
                destination: record.destination,
                metadata: record.metadata,
                externalKey: record.external_key,
              })
            : await this.listings.create(owner, {
                title: record.title,
                description: record.description,
                priceMinor: record.price_minor,
                currency: record.currency,
                destination: record.destination,
                metadata: record.metadata,
                externalKey: record.external_key,
              });
          existing = listing;
        }
        durableListingId = listing.id;
        const desiredIds: string[] = [];
        for (const item of desired) {
          let value = existingByIdentity.get(item.identity);
          if (value) {
            if (value.transferIdentity !== item.identity) {
              value.transferIdentity = item.identity;
              await this.mediaRepository.save(value);
            }
            value = catalogue
              ? await this.media.updateCatalogue(owner, listing.id, value.id, {
                  altText: item.alt_text,
                  position: item.position,
                })
              : await this.media.update(owner, listing.id, value.id, {
                  altText: item.alt_text,
                  position: item.position,
                });
          } else {
            value = catalogue
              ? await this.media.createCatalogue(owner, listing.id, {
                  ...downloads.get(item.identity)!,
                  altText: item.alt_text,
                  position: item.position,
                  transferIdentity: item.identity,
                })
              : await this.media.create(owner, listing.id, {
                  ...downloads.get(item.identity)!,
                  altText: item.alt_text,
                  position: item.position,
                  transferIdentity: item.identity,
                });
            newlyCreatedMedia.push(value.id);
          }
          desiredIds.push(value.id);
        }
        for (const old of active)
          if (!desiredIds.includes(old.id))
            await (catalogue
              ? this.media.requestDeletionCatalogue(owner, listing.id, old.id)
              : this.media.requestDeletion(owner, listing.id, old.id));
        for (let position = 0; position < desiredIds.length; position++)
          await this.media.update(owner, listing.id, desiredIds[position], { position });
        await this.applyState(owner, listing.id, listing.state, record.state, catalogue);
        if (created) result.created++;
        else result.updated++;
        result.records.push({
          index,
          status: created ? "created" : "updated",
          listing_id: listing.id,
          retry_identity: `listing:${listing.id}`,
          retryable: false,
        });
      } catch (error) {
        let cleanupFailures = 0;
        if (durableListingId)
          for (const mediaId of newlyCreatedMedia)
            try {
              await this.media.requestDeletion(owner, durableListingId, mediaId);
            } catch {
              cleanupFailures++;
            }
        result.failed++;
        result.records.push({
          index,
          status: "failed",
          listing_id: durableListingId,
          retry_identity: durableListingId ? `listing:${durableListingId}` : undefined,
          code: "listing_import_failed",
          message: `${safeError(error)}${cleanupFailures ? `; ${cleanupFailures} tracked media item(s) still require cleanup` : ""}`,
          retryable: true,
        });
      }
    }
    return result;
  }
  private async resolveExisting(
    owner: Account,
    record: ListingTransferRecord,
    mode: "create" | "upsert",
    catalogue = false,
  ) {
    if (record.external_key) {
      const value = catalogue
        ? await this.listings.findCatalogueByExternalKey(owner, record.external_key)
        : await this.listings.findByExternalKey(owner, record.external_key);
      if (value) return value;
    }
    const id = record.retry_identity?.slice("listing:".length) ?? record.id;
    if (id) {
      try {
        return catalogue
          ? await this.listings.getCatalogue(id)
          : await this.listings.getOwner(owner, id);
      } catch (error) {
        if (mode === "upsert" || record.retry_identity)
          throw new Error(
            "Import identity does not belong to the authenticated owner or no longer exists",
          );
      }
    }
    if (mode === "upsert")
      throw new Error("Upsert requires external_key, retry_identity, or an owned listing id");
    return null;
  }
  private async applyState(
    owner: Account,
    id: string,
    current: ListingState,
    target: ListingState,
    catalogue = false,
  ) {
    if (target === current) return;
    const archive = catalogue
        ? this.listings.archiveCatalogue.bind(this.listings)
        : this.listings.archive.bind(this.listings),
      restore = catalogue
        ? this.listings.restoreCatalogue.bind(this.listings)
        : this.listings.restore.bind(this.listings),
      publish = catalogue
        ? this.listings.publishCatalogue.bind(this.listings)
        : this.listings.publish.bind(this.listings);
    if (target === "draft") {
      if (current === "published") {
        await archive(owner, id);
        current = "archived";
      }
      if (current === "archived") await restore(owner, id);
      return;
    }
    if (target === "published") {
      if (current === "archived") await restore(owner, id);
      if (current !== "published") await publish(owner, id);
      return;
    }
    await archive(owner, id);
  }
}

type ImportRecordResult = {
  index: number;
  status: "created" | "updated" | "skipped" | "failed";
  listing_id?: string;
  retry_identity?: string;
  code?: string;
  message?: string;
  retryable: boolean;
};
const mediaIdentity = (item: z.infer<typeof mediaSchema>) =>
  item.transfer_identity ??
  (item.media_id
    ? `media:${item.media_id}`
    : `url:${createHash("sha256").update(new URL(item.url).toString()).digest("hex")}`);
export function parseTransfer(body: string, format: TransferFormat): unknown {
  if (Buffer.byteLength(body) > 5 * 1024 * 1024) throw new Error("Import exceeds the 5 MiB limit");
  if (format === "json") return JSON.parse(body);
  if (format === "yaml") {
    if (/!!|(^|\s)[&*][A-Za-z0-9_-]+/.test(body))
      throw new Error("YAML tags and aliases are not allowed");
    return parseYaml(body, { schema: "core", maxAliasCount: 0 });
  }
  return parseCsv(body);
}
export function serializeTransfer(records: ListingTransferRecord[], format: TransferFormat) {
  if (format === "json") return JSON.stringify(records, null, 2);
  if (format === "yaml") return stringifyYaml(records, { aliasDuplicateObjects: false });
  return writeCsv(records);
}
const columns = [
  "id",
  "retry_identity",
  "external_key",
  "title",
  "description",
  "price_minor",
  "currency",
  "destination",
  "metadata",
  "state",
  "media",
] as const;
function writeCsv(records: ListingTransferRecord[]) {
  return (
    [
      columns.join(","),
      ...records.map((record) =>
        columns
          .map((column) =>
            csvCell(
              column === "metadata" || column === "media"
                ? JSON.stringify(record[column])
                : String(record[column] ?? ""),
            ),
          )
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}
function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
function parseCsv(body: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const push = () => {
    row.push(cell.replace(/\r$/, "").replace(/^'(?=[=+\-@])/, ""));
    cell = "";
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") push();
    else if (c === "\n") {
      push();
      rows.push(row);
      row = [];
    } else cell += c;
    if (rows.length > 1001 || cell.length > 1_000_000)
      throw new Error("CSV input exceeds parser limits");
  }
  if (quoted) throw new Error("Malformed CSV quotation");
  if (cell || row.length) {
    push();
    rows.push(row);
  }
  const header = rows.shift();
  if (!header || columns.some((column, index) => header[index] !== column))
    throw new Error("CSV header is invalid");
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) =>
      Object.fromEntries(
        columns.map((column, index) => [
          column,
          column === "metadata" || column === "media"
            ? JSON.parse(values[index] || (column === "media" ? "[]" : "{}"))
            : column === "id" || column === "retry_identity" || column === "external_key"
              ? values[index] || undefined
              : values[index],
        ]),
      ),
    );
}
const safeError = (error: unknown) =>
  error instanceof z.ZodError
    ? `${error.issues[0]?.path.join(".") || "record"}: ${error.issues[0]?.message}`
    : error instanceof Error
      ? error.message
      : "Import failed";
