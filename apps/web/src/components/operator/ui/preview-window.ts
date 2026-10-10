export type OperatorPreviewKind = "catalogue" | "blog";

export function operatorPreviewWindowName(kind: OperatorPreviewKind, identity: string) {
  return `cliqero-${kind}-preview-${identity}`;
}

export function openOperatorPreviewWindow(url: string, name: string) {
  const tab = window.open(url, name);
  if (tab) tab.opener = null;
  return tab;
}
