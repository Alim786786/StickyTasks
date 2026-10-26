import type { TabInfo } from '../shared/types';

export function toTabInfo(tab: chrome.tabs.Tab): TabInfo | null {
  if (tab.id === undefined || tab.id === chrome.tabs.TAB_ID_NONE) return null;
  return { id: tab.id, windowId: tab.windowId, url: tab.url || tab.pendingUrl || '' };
}

export async function queryAllTabs(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({});
  return tabs.map(toTabInfo).filter((t): t is TabInfo => t !== null);
}

export async function getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

export async function focusTab(tabId: number, windowId: number): Promise<boolean> {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}
