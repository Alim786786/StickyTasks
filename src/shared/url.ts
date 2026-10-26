const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-search://',
  'chrome-untrusted://',
  'devtools://',
  'edge://',
  'about:',
  'view-source:',
  'data:',
  'javascript:',
  'https://chrome.google.com/webstore',
  'https://chromewebstore.google.com',
];

/** True when Chrome won't let extensions inject scripts into the page. */
export function isRestrictedUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some((p) => url.startsWith(p));
}

/** Comparable form of a URL for session matching (ignores the fragment). */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

export function displayHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host || u.protocol.replace(':', '');
  } catch {
    return url;
  }
}
