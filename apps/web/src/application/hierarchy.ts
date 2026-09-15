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
