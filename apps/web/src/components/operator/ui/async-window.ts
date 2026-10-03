export async function openResolvedWindow(loadUrl: () => Promise<string>) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) return false;
  tab.opener = null;
  try {
    tab.location.replace(await loadUrl());
    return true;
  } catch {
    tab.close();
    return false;
  }
}
