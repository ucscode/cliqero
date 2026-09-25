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
import {
  hierarchyGraphFromTree,
  hierarchyNodeAccessibleLabel,
  hierarchyNodeNavigationTarget,
  type HierarchyGraphNode,
} from "./model";
import { layoutHierarchyGraph } from "./layout";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { cn } from "@/lib/utils";

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
  const navigationTarget = hierarchyNodeNavigationTarget(data);
  const accessibleLabel = hierarchyNodeAccessibleLabel(data);
  const showUsername = data.displayName !== null && data.displayName !== data.username;
  const primaryContent = (
    <>
      <span className="flex items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800"
          aria-hidden="true"
        >
          {data.label.slice(0, 1).toUpperCase()}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <strong className="truncate text-sm text-slate-900" title={data.label}>
            {data.label}
          </strong>
          {showUsername && (
            <span className="truncate text-xs text-slate-500">@{data.username}</span>
          )}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {data.role === "context-parent" && (
          <span className="font-semibold uppercase tracking-wide text-slate-500">Parent</span>
        )}
        {data.isRoot && (
          <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 font-semibold text-white">
            Current root
          </span>
        )}
        {data.isSelf && !data.isRoot && (
          <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 font-semibold text-white">
            You
          </span>
        )}
        {data.role !== "context-parent" && <span>{data.directChildCount} children</span>}
        {data.hasMoreChildren && <span>More available</span>}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "relative w-[220px] rounded-xl border bg-white text-left shadow-sm transition",
        data.isRoot && "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-100",
        data.role === "context-parent" && "border-slate-300 bg-slate-50/90 opacity-80",
        navigationTarget &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md",
      )}
      aria-label={accessibleLabel}
      aria-disabled={data.role === "context-parent" && !data.canNavigate ? true : undefined}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-emerald-700 !bg-white"
      />
      {navigationTarget ? (
        <button
          type="button"
          className="grid w-full gap-3 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-inset"
          onClick={() => data.onViewBranch(navigationTarget)}
          aria-label={`Explore ${accessibleLabel}`}
        >
          {primaryContent}
        </button>
      ) : (
        <div className="grid w-full gap-3 p-3">{primaryContent}</div>
      )}
      {(data.hasMoreChildren ||
        (data.operatorMode && (data.onViewUser || data.onReassignParent))) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.hasMoreChildren && data.canLoadMoreChildren && (
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:border-emerald-400 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
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
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:border-emerald-400 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
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
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:border-emerald-400 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              onClick={(event) => {
                event.stopPropagation();
                data.onReassignParent?.(data.id);
              }}
            >
              Reassign parent
            </button>
          )}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2 !border-emerald-700 !bg-white"
      />
    </div>
  );
}

export function HierarchyGraph({
  tree,
  selfAccountId,
  onViewBranch,
  onLoadChildren,
  loadingChildren,
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
          <h3 className="text-lg font-semibold tracking-tight">
            {operatorMode ? "Explore the referral network" : "Explore your referral network"}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            {operatorMode
              ? `This window shows up to ${tree.windowDepth} generations. `
              : `Showing up to ${tree.windowDepth} levels of your network. `}
            {operatorMode
              ? "Rebase onto any account to inspect another branch."
              : "Choose someone in your network to keep exploring."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tree.root !== selfAccountId && (
            <Button type="button" variant="secondary" onClick={onResetRoot}>
              My network
            </Button>
          )}
        </div>
      </div>
      <div
        className="h-[min(640px,68vh)] min-h-[440px] overflow-hidden rounded-xl border border-slate-200 bg-[#f8fbf7]"
        aria-label={operatorMode ? "Referral hierarchy graph" : "Referral network graph"}
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
          nodesDraggable={operatorMode}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          aria-label="Referral network"
        >
          <Background color="#dfe8de" gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
    </Card>
  );
}
