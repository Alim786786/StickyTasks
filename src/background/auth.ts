// Per-tab authorization of the panel iframe.
//
// panel.html must be web-accessible so it can be framed into pages, which
// means a hostile page could frame it too (e.g. invisibly, for clickjacking).
// The host content script registers a random nonce here and hands it to *its*
// iframe over postMessage targeted at the extension origin. The first panel
// frame presenting that nonce is bound to the tab by documentId; the nonce is
// then consumed. Panel requests from any other frame are rejected.

const key = (tabId: number) => `auth:${tabId}`;

interface AuthRecord {
  nonce: string | null;
  documentId: string | null;
}

async function get(tabId: number): Promise<AuthRecord | undefined> {
  const res = await chrome.storage.session.get(key(tabId));
  return res[key(tabId)] as AuthRecord | undefined;
}

export async function registerHost(tabId: number, nonce: string): Promise<void> {
  await chrome.storage.session.set({ [key(tabId)]: { nonce, documentId: null } satisfies AuthRecord });
}

export async function authorizePanel(tabId: number, nonce: string, documentId: string): Promise<boolean> {
  const rec = await get(tabId);
  if (!rec?.nonce || rec.nonce !== nonce) return false;
  await chrome.storage.session.set({ [key(tabId)]: { nonce: null, documentId } satisfies AuthRecord });
  return true;
}

export async function isAuthorizedPanel(tabId: number, documentId: string): Promise<boolean> {
  const rec = await get(tabId);
  return Boolean(rec?.documentId) && rec!.documentId === documentId;
}

export async function clearAuth(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId));
}
