export interface HierarchySearchItem {
  id: string;
  username: string;
  displayName: string | null;
}

export function hierarchySearchPath(query: string): string {
  const params = new URLSearchParams({ q: query.trim(), exact: "true", limit: "1" });
  return `/api/hierarchy/search?${params}`;
}

export class HierarchyUsernameSearch {
  constructor(
    private readonly fetcher: (path: string) => Promise<{ items: HierarchySearchItem[] }>,
  ) {}

  async find(query: string): Promise<HierarchySearchItem | null> {
    const normalized = query.trim();
    if (!normalized) return null;
    const { items } = await this.fetcher(hierarchySearchPath(normalized));
    return items[0] ?? null;
  }
}
