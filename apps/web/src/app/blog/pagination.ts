type ArchiveFilters = {
  category?: string;
  tag?: string;
};

type ArchiveNavigationInput = ArchiveFilters & {
  cursor?: string;
  trail?: string;
  nextCursor?: string | null;
};

function archivePath({ category, tag }: ArchiveFilters) {
  if (category) return `/blog/category/${encodeURIComponent(category)}`;
  if (tag) return `/blog/tag/${encodeURIComponent(tag)}`;
  return "/blog";
}

/**
 * The blog API exposes a forward-only keyset cursor. The URL trail records the
 * boundaries visited before the current page so that archive navigation can
 * move in both directions without changing that API contract.
 */
export function decodeCursorTrail(value?: string): string[] {
  if (!value) return [];
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = JSON.parse(decodeURIComponent(value));
    }
    if (!Array.isArray(parsed) || parsed.length > 100) return [];
    return parsed.every((item): item is string => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

export function archiveHref({
  category,
  tag,
  cursor,
  trail,
}: ArchiveFilters & {
  cursor?: string;
  trail?: string[];
}) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  // URLSearchParams performs the URL encoding; keep the value JSON so the
  // framework gives the page the same opaque trail after navigation/refresh.
  if (trail?.length) query.set("trail", JSON.stringify(trail));
  const search = query.toString();
  return `${archivePath({ category, tag })}${search ? `?${search}` : ""}`;
}

export function archiveNavigation({
  category,
  tag,
  cursor,
  trail: encodedTrail,
  nextCursor,
}: ArchiveNavigationInput) {
  const trail = decodeCursorTrail(encodedTrail);
  const newerBoundary = trail.at(-1);
  const previousTrail = trail.slice(0, -1);
  const newerHref = trail.length
    ? archiveHref({
        category,
        tag,
        cursor: newerBoundary || undefined,
        trail: previousTrail,
      })
    : null;
  const olderHref = nextCursor
    ? archiveHref({
        category,
        tag,
        cursor: nextCursor,
        trail: [...trail, cursor ?? ""],
      })
    : null;
  return { newerHref, olderHref };
}
