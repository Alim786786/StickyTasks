import { normalizeState } from '../shared/model';
import { STATE_KEY, type Envelope, type PanelRequest, type ResponseMap } from '../shared/messages';
import type { AppState } from '../shared/types';

export async function request<K extends PanelRequest['type']>(
  req: Extract<PanelRequest, { type: K }>,
): Promise<ResponseMap[K]> {
  const res: Envelope<ResponseMap[K]> | undefined = await chrome.runtime.sendMessage(req);
  if (!res) throw new Error('No response from StickyTasks');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

export async function readState(): Promise<AppState> {
  const raw = await chrome.storage.local.get(STATE_KEY);
  return normalizeState(raw[STATE_KEY], Date.now());
}

/** Saved content is shared by every panel through storage change events. */
export function onStateChange(cb: (s: AppState) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[STATE_KEY]) cb(normalizeState(changes[STATE_KEY].newValue, Date.now()));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
