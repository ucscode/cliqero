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

  override claimDeletionWork(input: {
    now: Date;
    staleBefore: Date;
    claimToken: string;
    limit?: number;
  }) {
    return (
      this.db
        .prepare(
          `update blog_media_assets
           set deletion_claim_token=?,deletion_claimed_at=?
           where id in (
             select id from blog_media_assets
             where state='deletion_pending'
               and (deletion_claim_token is null or deletion_claimed_at<=?)
               and (deletion_retry_at is null or deletion_retry_at<=?)
             order by created_at,id limit ?
           )
             and state='deletion_pending'
             and (deletion_claim_token is null or deletion_claimed_at<=?)
             and (deletion_retry_at is null or deletion_retry_at<=?)
           returning *`,
        )
        .all(
          input.claimToken,
          input.now.getTime(),
          input.staleBefore.getTime(),
          input.now.getTime(),
          input.limit ?? 50,
          input.staleBefore.getTime(),
          input.now.getTime(),
        ) as Record<string, unknown>[]
    ).map(project);
  }

  override scheduleDeletionRetry(id: string, claimToken: string, failedAt: Date) {
    this.db
      .prepare(
        `update blog_media_assets
         set deletion_attempts=deletion_attempts+1,
             deletion_retry_at=? + min(300000,1000 * (1 << min(deletion_attempts,8))),
             deletion_claim_token=null,deletion_claimed_at=null
         where id=? and state='deletion_pending' and deletion_claim_token=?`,
      )
      .run(failedAt.getTime(), id, claimToken);
  }

  override deleteById(id: string, claimToken: string) {
    return (
      this.db
        .prepare(
          "delete from blog_media_assets where id=? and state='deletion_pending' and deletion_claim_token=?",
        )
        .run(id, claimToken).changes > 0
    );
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
