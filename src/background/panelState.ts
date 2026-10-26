// Per-tab panel UI state lives in chrome.storage.session: it survives page
// reloads and service-worker restarts but is cleared when the browser quits.
import { GLOBAL_NOTE_ID, type PanelRect, type PanelUi } from '../shared/types';

const key = (tabId: number) => `ui:${tabId}`;
const LAST_RECT = 'ui:lastRect';

export async function getPanelUi(tabId: number): Promise<PanelUi> {
  const res = await chrome.storage.session.get([key(tabId), LAST_RECT]);
  const stored = res[key(tabId)] as PanelUi | undefined;
  return {
    visible: stored?.visible ?? false,
    viewNoteId: stored?.viewNoteId ?? GLOBAL_NOTE_ID,
    // New tabs open the panel where it was last placed.
    rect: stored && stored.rect !== undefined ? stored.rect : ((res[LAST_RECT] as PanelRect | undefined) ?? null),
  };
}

export async function setPanelUi(tabId: number, patch: Partial<PanelUi>): Promise<void> {
  const current = await getPanelUi(tabId);
  await chrome.storage.session.set({ [key(tabId)]: { ...current, ...patch } });
  if (patch.rect) await chrome.storage.session.set({ [LAST_RECT]: patch.rect });
  else if (patch.rect === null) await chrome.storage.session.remove(LAST_RECT);
}

export async function removePanelUi(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId));
}

export async function movePanelUi(fromTabId: number, toTabId: number): Promise<void> {
  const res = await chrome.storage.session.get(key(fromTabId));
  const value = res[key(fromTabId)];
  if (!value) return;
  await chrome.storage.session.set({ [key(toTabId)]: value });
  await chrome.storage.session.remove(key(fromTabId));
}
