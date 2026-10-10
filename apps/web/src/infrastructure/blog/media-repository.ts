import type Database from "better-sqlite3";
import type { StoredObject } from "@/modules/storage/object-storage";
import { BlogMediaRepository, type BlogMediaAsset } from "@/application/blog/contracts";

export class SqliteBlogMediaRepository extends BlogMediaRepository {
  constructor(private readonly db: Database.Database) {
    super();
  }

  override create(input: {
    id: string;
    ownerAccountId: string;
    stored: StoredObject;
    createdAt: Date;
    expiresAt: Date;
  }) {
    this.db
      .prepare(
        `insert into blog_media_assets
          (id,owner_account_id,post_id,storage_provider,storage_container,object_key,mime_type,byte_size,state,created_at,expires_at)
         values(?,?,null,?,?,?,?,?,'active',?,?)`,
      )
      .run(
        input.id,
        input.ownerAccountId,
        input.stored.provider,
        input.stored.container,
        input.stored.key,
        input.stored.mimeType,
        input.stored.byteSize,
        input.createdAt.getTime(),
        input.expiresAt.getTime(),
      );
  }

  override findById(id: string) {
    const row = this.db.prepare("select * from blog_media_assets where id=?").get(id) as
      Record<string, unknown> | undefined;
    return row ? project(row) : null;
  }

  override markExpiredForDeletion(now: Date) {
    this.db
      .prepare(
        "update blog_media_assets set state='deletion_pending' where post_id is null and state='active' and expires_at<=?",
      )
      .run(now.getTime());
  }

  override markUnattachedForDeletion(id: string, ownerAccountId: string) {
    return (
      this.db
        .prepare(
          `update blog_media_assets set state='deletion_pending'
          where id=? and owner_account_id=? and post_id is null and state='active'`,
        )
        .run(id, ownerAccountId).changes > 0
    );
  }

  override deletionWork(limit = 50) {
    return (
      this.db
        .prepare(
          "select * from blog_media_assets where state='deletion_pending' order by created_at,id limit ?",
        )
        .all(limit) as Record<string, unknown>[]
    ).map(project);
  }

  override deleteById(id: string) {
    this.db
      .prepare("delete from blog_media_assets where id=? and state='deletion_pending'")
      .run(id);
  }
}

function project(row: Record<string, unknown>): BlogMediaAsset {
  return {
    id: String(row.id),
    ownerAccountId: String(row.owner_account_id),
    postId: row.post_id == null ? null : String(row.post_id),
    storageProvider: String(row.storage_provider),
    storageContainer: String(row.storage_container),
    objectKey: String(row.object_key),
    mimeType: String(row.mime_type),
    byteSize: Number(row.byte_size),
    state: row.state as BlogMediaAsset["state"],
    createdAt: new Date(Number(row.created_at)),
    expiresAt: row.expires_at == null ? null : new Date(Number(row.expires_at)),
  };
}
