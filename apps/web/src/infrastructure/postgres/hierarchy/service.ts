import type { QueryExecutor } from "@/infrastructure/postgres/shared/query";
import type {
  HierarchyChildren,
  HierarchyNode,
  HierarchyParent,
  HierarchyReader,
} from "@/application/hierarchy";

export class PostgresHierarchyReader implements HierarchyReader {
  constructor(private readonly sql: QueryExecutor) {}

  async exists(accountId: string) {
    const result = await this.sql.query(
      `select 1 from identity_capability.accounts where uuid=$1`,
      [accountId],
    );
    return result.rowCount === 1;
  }

  async isDescendantOrSelf(ancestor: string, candidate: string) {
    const result = await this.sql.query(
      `with recursive tree(id,path) as (
         select (select id from identity_capability.accounts where uuid=$1),array[(select id from identity_capability.accounts where uuid=$1)]
         union all
         select ar.child_account_id,tree.path||ar.child_account_id
           from tree
           join referral_capability.account_referrals ar on ar.parent_account_id=tree.id
          where not ar.child_account_id=any(tree.path)
       ) select 1 from tree where id=(select id from identity_capability.accounts where uuid=$2)`,
      [ancestor, candidate],
    );
    return result.rowCount === 1;
  }

  async tree(root: string, childLimit: number, depth: number) {
    const rows = await this.sql.query<any>(
      `with recursive tree(id,parent_id,depth,path) as (
        select (select id from identity_capability.accounts where uuid=$1),null::bigint,0,array[(select id from identity_capability.accounts where uuid=$1)]
        union all
        select r.child_account_id,r.parent_account_id,tree.depth+1,tree.path||r.child_account_id
        from tree join lateral (
          select child_account_id,parent_account_id
            from referral_capability.account_referrals
           where parent_account_id=tree.id
           order by child_account_id limit $2
        ) r on true
        where tree.depth < $3 and not r.child_account_id=any(tree.path)
      )
      select a.uuid id,parent.uuid parent_id,tree.depth,a.username,a.display_name,
        (select count(*)::int from referral_capability.account_referrals x where x.parent_account_id=tree.id) direct_child_count,
        exists(select 1 from referral_capability.account_referrals x where x.parent_account_id=tree.id) has_children,
        (select count(*) from referral_capability.account_referrals x where x.parent_account_id=tree.id) > $2 has_more_children,
        (select child.uuid from referral_capability.account_referrals x join identity_capability.accounts child on child.id=x.child_account_id where x.parent_account_id=tree.id order by x.child_account_id offset ($2 - 1) limit 1) next_child_cursor
      from tree
      join identity_capability.account_profiles a on a.id=tree.id
      left join identity_capability.account_profiles parent on parent.id=tree.parent_id
      order by tree.depth,tree.id`,
      [root, childLimit, depth],
    );
    const nodes: HierarchyNode[] = rows.rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name ?? null,
      depth: Number(row.depth),
      directChildCount: Number(row.direct_child_count),
      hasChildren: Boolean(row.has_children),
      hasMoreChildren: Boolean(row.has_more_children),
      nextChildCursor: row.next_child_cursor ?? null,
    }));
    return {
      nodes,
      edges: rows.rows
        .filter((row: any) => row.parent_id)
        .map((row: any) => ({ parent: row.parent_id, child: row.id })),
    };
  }

  async parent(root: string): Promise<Omit<HierarchyParent, "canNavigate"> | null> {
    const row = (
      await this.sql.query<any>(
        `select a.uuid id,a.username,a.display_name
           from referral_capability.account_referrals r
           join identity_capability.account_profiles a on a.id=r.parent_account_id
          where r.child_account_id=(select id from identity_capability.accounts where uuid=$1)`,
        [root],
      )
    ).rows[0];
    return row
      ? { id: row.id, username: row.username, displayName: row.display_name ?? null }
      : null;
  }

  async children(
    parentId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<HierarchyChildren> {
    const rows = await this.sql.query<any>(
      `select a.uuid id,a.username,a.display_name,1::int depth,
        (select count(*)::int from referral_capability.account_referrals x where x.parent_account_id=a.id) direct_child_count,
        exists(select 1 from referral_capability.account_referrals x where x.parent_account_id=a.id) has_children,
        (select count(*) from referral_capability.account_referrals x where x.parent_account_id=a.id) > $3 has_more_children,
        (select child.uuid from referral_capability.account_referrals x join identity_capability.accounts child on child.id=x.child_account_id where x.parent_account_id=a.id order by x.child_account_id offset ($3 - 1) limit 1) next_child_cursor
       from referral_capability.account_referrals r
       join identity_capability.account_profiles a on a.id=r.child_account_id
       where r.parent_account_id=(select id from identity_capability.accounts where uuid=$1)
         and ($2::uuid is null or r.child_account_id>(select id from identity_capability.accounts where uuid=$2))
       order by r.child_account_id limit $4`,
      [parentId, cursor ?? null, limit, limit + 1],
    );
    const visible = rows.rows.slice(0, limit);
    return {
      parentId,
      items: visible.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name ?? null,
        depth: 1,
        directChildCount: Number(row.direct_child_count),
        hasChildren: Boolean(row.has_children),
        hasMoreChildren: Boolean(row.has_more_children),
        nextChildCursor: row.next_child_cursor ?? null,
      })),
      nextCursor: rows.rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
    };
  }

  async search(query: string, scopeRoot: string | null, limit: number) {
    const params: unknown[] = [query, limit];
    let scope = "";
    if (scopeRoot) {
      params.push(scopeRoot);
      scope = `and a.id in (
        with recursive tree(id,path) as (
          select (select id from identity_capability.accounts where uuid=$3),array[(select id from identity_capability.accounts where uuid=$3)]
          union all
          select ar.child_account_id,tree.path||ar.child_account_id
            from tree
            join referral_capability.account_referrals ar on ar.parent_account_id=tree.id
           where not ar.child_account_id=any(tree.path)
        ) select id from tree
      )`;
    }
    const rows = await this.sql.query<any>(
      `select a.uuid id,a.username,a.display_name
         from identity_capability.account_profiles a
        where (a.uuid::text=$1 or a.username ilike '%'||$1||'%' or a.email ilike '%'||$1||'%')
          ${scope}
        order by a.username limit $2`,
      params,
    );
    return rows.rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name ?? null,
    }));
  }
}
