import type { PanelCommand } from '../shared/messages';
import { isRestrictedUrl } from '../shared/url';
import { getTab } from './tabs';

// One in-flight injection per tab, so rapid clicks can't inject twice.
const injecting = new Map<number, Promise<boolean>>();

async function ensureContentScript(tabId: number): Promise<boolean> {
  const pending = injecting.get(tabId);
  if (pending) return pending;
  const run = (async () => {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return true;
    } catch {
      return false;
    } finally {
      injecting.delete(tabId);
    }
  })();
  injecting.set(tabId, run);
  return run;
}

async function trySend(tabId: number, cmd: PanelCommand): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, cmd, { frameId: 0 });
    return true;
  } catch {
    return false;
  }
}

/** Delivers a command to the tab's panel, injecting the content script if needed. */
export async function sendPanelCommand(tabId: number, cmd: PanelCommand): Promise<boolean> {
  const tab = await getTab(tabId);
  if (!tab || isRestrictedUrl(tab.url || tab.pendingUrl)) return false;
  if (await trySend(tabId, cmd)) return true;
  if (!(await ensureContentScript(tabId))) return false;
  return trySend(tabId, cmd);
}

export async function flagUnavailable(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3A3A3C' });
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setTitle({ tabId, title: 'StickyTasks can’t run on this page' });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined);
      chrome.action.setTitle({ tabId, title: 'StickyTasks' }).catch(() => undefined);
    }, 2500);
  } catch {
    // Tab may already be gone.
  }
}
