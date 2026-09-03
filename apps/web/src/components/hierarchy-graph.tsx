"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import type { HierarchyTree } from "@/lib/api-client";
import { hierarchyGraphFromTree, type HierarchyGraphNode } from "./hierarchy-graph-model";
import { layoutHierarchyGraph } from "./hierarchy-graph-layout";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type HierarchyNodeData = HierarchyGraphNode & {
  onViewBranch: (id: string) => void;
  onViewUser?: (id: string) => void;
  onReassignParent?: (id: string) => void;
  operatorMode?: boolean;
  onLoadChildren: (id: string) => void;
  loadingChildren: boolean;
};
type FlowNode = Node<HierarchyNodeData, "cliqero">;

const nodeTypes = { cliqero: CliqeroHierarchyNode };

function CliqeroHierarchyNode({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className={`hierarchy-node${data.isRoot ? " hierarchy-node-root" : ""}${data.isSelf ? " hierarchy-node-self" : ""}`}
      aria-label={`${data.label}, generation ${data.depth}`}
    >
      <Handle type="target" position={Position.Top} className="hierarchy-handle" />
      <div className="hierarchy-node-heading">
        <span className="hierarchy-node-avatar" aria-hidden="true">
          {data.label.slice(0, 1).toUpperCase()}
        </span>
        <div className="hierarchy-node-copy">
          <strong title={data.label}>{data.label}</strong>
          <span>@{data.handle}</span>
        </div>
      </div>
      <div className="hierarchy-node-meta">
        <span>Generation {data.depth}</span>
        {data.isRoot && <Badge variant="destructive">Current root</Badge>}
        {data.isSelf && !data.isRoot && <Badge variant="default">You</Badge>}
      </div>
      <div className="hierarchy-node-footer">
        <span>{data.directChildCount} direct children</span>
        {data.hasMoreChildren && <span className="hierarchy-more">More available</span>}
      </div>
      <div className="hierarchy-node-actions">
        {!data.isRoot && (
          <button
            type="button"
            className="hierarchy-node-action"
            onClick={(event) => {
              event.stopPropagation();
              data.onViewBranch(data.id);
            }}
          >
            View branch
          </button>
        )}
        {data.hasMoreChildren && data.canLoadMoreChildren && (
          <button
            type="button"
            className="hierarchy-node-action"
            onClick={(event) => {
              event.stopPropagation();
              data.onLoadChildren(data.id);
            }}
            disabled={data.loadingChildren}
          >
            {data.loadingChildren ? "Loading…" : "Load more"}
          </button>
        )}
        {data.operatorMode && data.onViewUser && (
          <button
            type="button"
            className="hierarchy-node-action"
            onClick={(event) => {
              event.stopPropagation();
              data.onViewUser?.(data.id);
            }}
          >
            View user
          </button>
        )}
        {data.operatorMode && data.onReassignParent && !data.isRoot && (
          <button
            type="button"
            className="hierarchy-node-action"
            onClick={(event) => {
              event.stopPropagation();
              data.onReassignParent?.(data.id);
            }}
          >
            Reassign parent
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="hierarchy-handle" />
    </div>
  );
}

export function HierarchyGraph({
  tree,
  selfAccountId,
  onViewBranch,
  onLoadChildren,
  loadingChildren,
  onNavigateParent,
  onResetRoot,
  operatorMode = false,
  onViewUser,
  onReassignParent,
}: {
  tree: HierarchyTree;
  selfAccountId: string;
  onViewBranch: (id: string) => void;
  onLoadChildren: (id: string) => void;
  loadingChildren: string | null;
  onNavigateParent: () => void;
  onResetRoot: () => void;
  operatorMode?: boolean;
  onViewUser?: (id: string) => void;
  onReassignParent?: (id: string) => void;
}) {
  const graph = useMemo(() => hierarchyGraphFromTree(tree, selfAccountId), [tree, selfAccountId]);
  const layout = useMemo(() => layoutHierarchyGraph(graph), [graph]);
  const flowNodes = useMemo<FlowNode[]>(
    () =>
      layout.nodes.map((node) => ({
        id: node.id,
        type: "cliqero",
        position: node.position,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          ...node,
          onViewBranch,
          onViewUser,
          onReassignParent,
          operatorMode,
          onLoadChildren,
          loadingChildren: loadingChildren === node.id,
        },
      })),
    [
      layout.nodes,
      loadingChildren,
      onLoadChildren,
      onReassignParent,
      onViewBranch,
      onViewUser,
      operatorMode,
    ],
  );
  const flowEdges = useMemo<Edge[]>(
    () => layout.edges.map((edge) => ({ ...edge, type: "smoothstep", animated: false })),
    [layout.edges],
  );
  const [nodes, setNodes] = useState<FlowNode[]>(flowNodes);

  useEffect(() => {
    // Synchronize server-backed graph changes while preserving React Flow's viewport.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes(flowNodes);
  }, [flowNodes]);

  function handleNodesChange(changes: NodeChange<FlowNode>[]) {
    setNodes((current) => applyNodeChanges(changes, current) as FlowNode[]);
  }

  return (
    <Card className="min-w-0 p-5">
      <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <p className="eyebrow">Network explorer</p>
          <h3>{operatorMode ? "Explore the referral network" : "Explore your referral network"}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            This window shows up to {tree.windowDepth} generations.{" "}
            {operatorMode
              ? "Rebase onto any account to inspect another branch."
              : "Rebase onto a descendant to keep exploring your authorized network."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tree.root !== selfAccountId && (
            <Button type="button" variant="secondary" onClick={onResetRoot}>
              My network
            </Button>
          )}
          {tree.parent && (
            <Button
              type="button"
              variant="ghost"
              onClick={onNavigateParent}
              disabled={!tree.parent.canNavigate}
              title={
                tree.parent.canNavigate ? "View parent branch" : "Outside your network boundary"
              }
            >
              {tree.parent.canNavigate ? "Up one level" : "Upline context"}
            </Button>
          )}
        </div>
      </div>
      {tree.parent && (
        <div
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500"
          role="status"
        >
          <span>Parent context</span>
          <strong>{tree.parent.displayName || tree.parent.handle}</strong>
          {!tree.parent.canNavigate && <small>Navigation stops at your account.</small>}
        </div>
      )}
      <div
        className="h-[min(640px,68vh)] min-h-[440px] overflow-hidden rounded-xl border border-slate-200 bg-[#f8fbf7]"
        aria-label="Referral hierarchy graph"
      >
        <ReactFlow
          key={tree.root}
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          fitView
          fitViewOptions={{ padding: 0.2, minZoom: 0.45, maxZoom: 1.2 }}
          minZoom={0.3}
          maxZoom={1.5}
          nodesConnectable={false}
          nodesDraggable
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          aria-label="Referral network"
        >
          <Background color="#dfe8de" gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Dragging is visual only. Referral relationships change only through authorized account
        operations.
      </p>
    </Card>
  );
}
