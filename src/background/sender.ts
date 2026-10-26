import { PANEL_PAGE } from '../shared/messages';

export type SenderRole = 'host' | 'panel';

/**
 * Classifies a runtime message sender. Web pages can't reach runtime.onMessage
 * (no externally_connectable), but we still require our own extension ID and
 * a tab context, and distinguish:
 *  - panel: our panel.html document running in a subframe of a tab
 *  - host:  our content script in a tab's top frame (sender.url is the page)
 */
export function senderRole(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
  extensionOrigin: string,
): SenderRole | null {
  if (sender.id !== extensionId || typeof sender.tab?.id !== 'number' || sender.tab.id < 0) return null;
  const url = sender.url ?? '';
  if (url.startsWith(extensionOrigin)) {
    const path = url.slice(extensionOrigin.length).split(/[?#]/)[0];
    return path === PANEL_PAGE && typeof sender.frameId === 'number' && sender.frameId > 0 ? 'panel' : null;
  }
  return sender.frameId === 0 ? 'host' : null;
}
