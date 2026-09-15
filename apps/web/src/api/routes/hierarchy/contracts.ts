import { z } from "@hono/zod-openapi";

export const nodeSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  depth: z.number(),
  directChildCount: z.number(),
  hasChildren: z.boolean(),
  hasMoreChildren: z.boolean(),
  nextChildCursor: z.string().nullable(),
});
export const parentSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string().nullable(),
  canNavigate: z.boolean(),
});
export const treeSchema = z.object({
  root: z.string(),
  windowDepth: z.number(),
  childLimit: z.number(),
  parent: parentSchema.nullable(),
  nodes: z.array(nodeSchema),
  edges: z.array(z.object({ parent: z.string(), child: z.string() })),
});
export const childrenSchema = z.object({
  parentId: z.string(),
  items: z.array(nodeSchema),
  nextCursor: z.string().nullable(),
});
export const reassignmentSchema = z.object({
  childAccountId: z.string(),
  parentAccountId: z.string(),
  previousParentAccountId: z.string().nullable(),
  changed: z.boolean(),
});
