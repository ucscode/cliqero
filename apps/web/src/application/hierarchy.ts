import { z } from "zod";
import { loadYamlConfiguration } from "@/config/yaml";

const visualizationSchema = z.object({
  hierarchy: z.object({
    visualization: z.object({
      depth: z.number().int().min(1),
      child_limit: z.number().int().min(1),
    }),
  }),
});

export interface VisualizationConfig {
  depth: number;
  childLimit: number;
}

export interface HierarchyNode {
  id: string;
  username: string;
  displayName: string | null;
  depth: number;
  directChildCount: number;
  hasChildren: boolean;
  hasMoreChildren: boolean;
  nextChildCursor: string | null;
}

export interface HierarchyParent {
  id: string;
  username: string;
  displayName: string | null;
  canNavigate: boolean;
}

export interface HierarchyTree {
  root: string;
  windowDepth: number;
  childLimit: number;
  parent: HierarchyParent | null;
  nodes: HierarchyNode[];
  edges: { parent: string; child: string }[];
}

export interface HierarchyChildren {
  parentId: string;
  items: HierarchyNode[];
  nextCursor: string | null;
}

export interface HierarchyReader {
  exists(accountId: string): Promise<boolean>;
  isDescendantOrSelf(ancestor: string, candidate: string): Promise<boolean>;
  tree(root: string, childLimit: number, depth: number): Promise<{
    nodes: HierarchyNode[];
    edges: { parent: string; child: string }[];
  }>;
  parent(root: string): Promise<Omit<HierarchyParent, "canNavigate"> | null>;
  children(
    parentId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<HierarchyChildren>;
  search(
    query: string,
    scopeRoot: string | null,
    limit: number,
  ): Promise<Array<{ id: string; username: string; displayName: string | null }>>;
}

export function visualizationConfig(
  path = "config/hierarchy/visualization.yaml",
): VisualizationConfig {
  const value = loadYamlConfiguration(path, process.env, { required: true });
  return visualizationConfigFromValue(value);
}

export function visualizationConfigFromValue(value: unknown): VisualizationConfig {
  const parsed = visualizationSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      `Invalid hierarchy visualization configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  return {
    depth: parsed.data.hierarchy.visualization.depth,
    childLimit: parsed.data.hierarchy.visualization.child_limit,
  };
}

export class HierarchyService {
  constructor(
    private readonly reader: HierarchyReader,
    private readonly config: VisualizationConfig = visualizationConfig(),
  ) {}

  isDescendantOrSelf(ancestor: string, candidate: string) {
    return this.reader.isDescendantOrSelf(ancestor, candidate);
  }

  async tree(requester: string, root: string, admin: boolean): Promise<HierarchyTree> {
    await this.assertRoot(requester, root, admin);
    const result = await this.reader.tree(
      root,
      this.config.childLimit,
      this.config.depth,
    );
    const parent = await this.reader.parent(root);
    return {
      root,
      windowDepth: this.config.depth,
      childLimit: this.config.childLimit,
      parent: parent
        ? {
            ...parent,
            canNavigate:
              admin || (await this.reader.isDescendantOrSelf(requester, parent.id)),
          }
        : null,
      nodes: result.nodes,
      edges: result.edges,
    };
  }

  async children(
    requester: string,
    parentId: string,
    admin: boolean,
    cursor?: string,
  ): Promise<HierarchyChildren> {
    await this.assertRoot(requester, parentId, admin);
    return this.reader.children(parentId, cursor, this.config.childLimit);
  }

  search(requester: string, q: string, admin: boolean, limit: number) {
    return this.reader.search(q, admin ? null : requester, limit);
  }

  private async assertRoot(requester: string, root: string, admin: boolean) {
    if (!(await this.reader.exists(root))) throw new Error("Hierarchy account not found");
    if (!admin && !(await this.reader.isDescendantOrSelf(requester, root)))
      throw new Error("Forbidden");
  }
}
