import type { SqlExecutor } from "@/infrastructure/postgres/database";
import type { ListingMedia, ListingMediaRepository } from "@/modules/listing-media/media";

export class PostgresListingMediaRepository implements ListingMediaRepository {
  constructor(private sql: SqlExecutor) {}
  async findById(id: string) {
    const row = (
      await this.sql.query<any>(`select * from listing_capability.media where id=$1`, [id])
    ).rows[0];
    return row ? map(row) : null;
  }
  async findByStorageIdentity(provider: string, container: string, key: string) {
    const row = (
      await this.sql.query<any>(
        `select * from listing_capability.media where storage_provider=$1 and storage_container=$2 and object_key=$3`,
        [provider, container, key],
      )
    ).rows[0];
    return row ? map(row) : null;
  }
  async listByListing(listingId: string, includeDeleted = false) {
    return (
      await this.sql.query<any>(
        `select * from listing_capability.media where listing_id=$1 ${includeDeleted ? "" : "and state<>'deleted'"} order by position,created_at,id`,
        [listingId],
      )
    ).rows.map(map);
  }
  async listByListings(ids: readonly string[]) {
    const result = new Map<string, ListingMedia[]>();
    for (const id of ids) result.set(id, []);
    if (ids.length === 0) return result;
    for (const row of (
      await this.sql.query<any>(
        `select * from listing_capability.media where listing_id=any($1::uuid[]) and state='active' order by listing_id,position,created_at,id`,
        [ids],
      )
    ).rows)
      result.get(row.listing_id)!.push(map(row));
    return result;
  }
  async save(v: ListingMedia) {
    await this.sql.query(
      `insert into listing_capability.media(id,listing_id,storage_provider,storage_container,object_key,mime_type,original_filename,byte_size,width,height,position,alt_text,state,transfer_identity,deletion_requested_at,deletion_attempted_at,deletion_attempt_count,deletion_next_attempt_at,deletion_claimed_at,deletion_lease_until,last_deletion_error,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) on conflict(id) do update set position=excluded.position,alt_text=excluded.alt_text,state=excluded.state,transfer_identity=excluded.transfer_identity,deletion_requested_at=excluded.deletion_requested_at,deletion_attempted_at=excluded.deletion_attempted_at,deletion_attempt_count=excluded.deletion_attempt_count,deletion_next_attempt_at=excluded.deletion_next_attempt_at,deletion_claimed_at=excluded.deletion_claimed_at,deletion_lease_until=excluded.deletion_lease_until,last_deletion_error=excluded.last_deletion_error,updated_at=now()`,
      [
        v.id,
        v.listingId,
        v.storageProvider,
        v.storageContainer,
        v.objectKey,
        v.mimeType,
        v.originalFilename,
        v.byteSize.toString(),
        v.width,
        v.height,
        v.position,
        v.altText,
        v.state,
        v.transferIdentity ?? null,
        v.deletionRequestedAt ?? null,
        v.deletionAttemptedAt ?? null,
        v.deletionAttemptCount ?? 0,
        v.deletionNextAttemptAt ?? null,
        v.deletionClaimedAt ?? null,
        v.deletionLeaseUntil ?? null,
        v.lastDeletionError ?? null,
        v.createdAt,
      ],
    );
  }
  async lockListing(listingId: string) {
    await this.sql.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [listingId]);
  }
  async reorderActive(listingId: string, orderedIds: readonly string[]) {
    await this.sql.query(
      `update listing_capability.media set position=position+1000000 where listing_id=$1 and state='active'`,
      [listingId],
    );
    for (let position = 0; position < orderedIds.length; position++)
      await this.sql.query(
        `update listing_capability.media set position=$1,updated_at=now() where id=$2 and listing_id=$3 and state='active'`,
        [position, orderedIds[position], listingId],
      );
  }
  async claimDeletionWork(limit = 50, leaseMs = 5 * 60_000) {
    const rows = (
      await this.sql.query<any>(
        `with candidates as (
      select id from listing_capability.media
      where state='deletion_pending'
        and coalesce(deletion_next_attempt_at,deletion_requested_at,created_at)<=now()
        and (deletion_lease_until is null or deletion_lease_until<=now())
      order by coalesce(deletion_next_attempt_at,deletion_requested_at,created_at),id
      for update skip locked limit $1
    ) update listing_capability.media media
      set deletion_claimed_at=now(),deletion_lease_until=now()+($2::bigint*interval '1 millisecond'),updated_at=now()
      from candidates where media.id=candidates.id returning media.*`,
        [limit, leaseMs],
      )
    ).rows;
    return rows.map(map);
  }
}

function map(r: any): ListingMedia {
  return {
    id: r.id,
    listingId: r.listing_id,
    storageProvider: r.storage_provider,
    storageContainer: r.storage_container,
    objectKey: r.object_key,
    mimeType: r.mime_type,
    originalFilename: r.original_filename,
    byteSize: BigInt(r.byte_size),
    width: r.width,
    height: r.height,
    position: r.position,
    altText: r.alt_text,
    state: r.state,
    createdAt: r.created_at,
    transferIdentity: r.transfer_identity,
    deletionRequestedAt: r.deletion_requested_at,
    deletionAttemptedAt: r.deletion_attempted_at,
    deletionAttemptCount: r.deletion_attempt_count,
    deletionNextAttemptAt: r.deletion_next_attempt_at,
    deletionClaimedAt: r.deletion_claimed_at,
    deletionLeaseUntil: r.deletion_lease_until,
    lastDeletionError: r.last_deletion_error,
  };
}
