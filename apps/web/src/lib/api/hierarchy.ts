export type ReferralPage = {
  accounts: string[];
  nextCursor: string | null;
};

export type Upline = {
  accountId: string;
  depth: number;
};

export type UplinePage = {
  uplines: Upline[];
};

export type HierarchyNode = {
  id: string;
  username: string;
  displayName: string | null;
  depth: number;
  directChildCount: number;
  hasChildren: boolean;
  hasMoreChildren: boolean;
  nextChildCursor: string | null;
};

export type HierarchyTree = {
  root: string;
  windowDepth: number;
  childLimit: number;
  parent: {
    id: string;
    username: string;
    displayName: string | null;
    canNavigate: boolean;
  } | null;
  nodes: HierarchyNode[];
  edges: { parent: string; child: string }[];
};

export type HierarchyChildren = {
  parentId: string;
  items: HierarchyNode[];
  nextCursor: string | null;
};

export type HierarchyDescendant = {
  id: string;
  username: string;
  displayName: string | null;
  level: number;
  upline: {
    id: string;
    username: string;
    displayName: string | null;
  } | null;
  directChildCount: number;
};

export type HierarchyDescendantPage = {
  items: HierarchyDescendant[];
  nextCursor: string | null;
};

export type HierarchyLevels = {
  levels: number[];
};
