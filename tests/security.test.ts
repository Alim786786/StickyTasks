import { beforeEach, describe, expect, it } from 'vitest';
import { senderRole } from '../src/background/sender';
import { normalizeState } from '../src/shared/model';
import { clampRect } from '../src/shared/geometry';
import { isNonce, isReopenableUrl, parseOp, parseUiPatch } from '../src/shared/validate';

const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${EXT_ID}/`;
const tab = { id: 5 } as chrome.tabs.Tab;

describe('senderRole', () => {
  const base = { id: EXT_ID, tab };

  it('classifies our content script in the top frame as host', () => {
    expect(senderRole({ ...base, frameId: 0, url: 'https://example.com/' }, EXT_ID, ORIGIN)).toBe('host');
  });

  it('classifies our panel page in a subframe as panel', () => {
    expect(senderRole({ ...base, frameId: 3, url: `${ORIGIN}panel.html` }, EXT_ID, ORIGIN)).toBe('panel');
  });

  it('rejects other extensions, tabless senders, subframe content scripts and top-level panel pages', () => {
    expect(senderRole({ ...base, id: 'other', frameId: 0, url: 'https://x.com/' }, EXT_ID, ORIGIN)).toBeNull();
    expect(senderRole({ id: EXT_ID, frameId: 0, url: 'https://x.com/' }, EXT_ID, ORIGIN)).toBeNull();
    expect(senderRole({ ...base, frameId: 2, url: 'https://x.com/' }, EXT_ID, ORIGIN)).toBeNull();
    expect(senderRole({ ...base, frameId: 0, url: `${ORIGIN}panel.html` }, EXT_ID, ORIGIN)).toBeNull();
    expect(senderRole({ ...base, frameId: 1, url: `${ORIGIN}other.html` }, EXT_ID, ORIGIN)).toBeNull();
  });
});

describe('parseOp', () => {
  it('accepts valid ops and strips unknown fields', () => {
    const op = parseOp({ t: 'task.add', noteId: 'global', taskId: 'task_1', text: 'hi', evil: 1 });
    expect(op).toEqual({ t: 'task.add', noteId: 'global', taskId: 'task_1', text: 'hi', index: undefined });
  });

  it.each([
    null,
    'task.add',
    { t: 'unknown.op' },
    { t: 'task.add', noteId: 'global', taskId: 'x', text: 42 },
    { t: 'task.add', noteId: 'global', taskId: 'x', text: 'a'.repeat(5000) },
    { t: 'task.add', noteId: '__proto__', taskId: 'x', text: 'a' },
    { t: 'task.add', noteId: 'global', taskId: 'x', text: 'a', index: -1 },
    { t: 'task.update', noteId: 'global', taskId: 'x', done: 'yes' },
    { t: 'task.move', noteId: 'global', taskId: 'x', toIndex: 1.5 },
    { t: 'note.rename', noteId: 'global', title: { toString: 'x' } },
    { t: 'settings.set', patch: { isAdmin: true } },
    { t: 'settings.set', patch: 'switchTabs' },
  ])('rejects %j', (raw) => {
    expect(parseOp(raw)).toBeNull();
  });

  it('only persists allowlisted settings', () => {
    expect(parseOp({ t: 'settings.set', patch: { switchTabs: true, extra: 'x' } })).toEqual({
      t: 'settings.set',
      patch: { switchTabs: true },
    });
  });
});

describe('parseUiPatch', () => {
  it('lets each role change only its own fields', () => {
    expect(parseUiPatch({ visible: true }, 'host')).toEqual({ visible: true });
    expect(parseUiPatch({ viewNoteId: 'global' }, 'host')).toBeNull();
    expect(parseUiPatch({ viewNoteId: 'global' }, 'panel')).toEqual({ viewNoteId: 'global' });
    expect(parseUiPatch({ visible: true }, 'panel')).toBeNull();
  });

  it('rejects malformed geometry', () => {
    expect(parseUiPatch({ rect: { x: NaN, y: 0, width: 300, height: null } }, 'host')).toBeNull();
    expect(parseUiPatch({ rect: { x: 0, y: 0, width: 1e9, height: null } }, 'host')).toBeNull();
    expect(parseUiPatch({ rect: null }, 'host')).toEqual({ rect: null });
  });
});

describe('URL and nonce checks', () => {
  it('only reopens web/file URLs from the archive', () => {
    expect(isReopenableUrl('https://example.com/a')).toBe(true);
    expect(isReopenableUrl('file:///C:/notes.txt')).toBe(true);
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'chrome://settings', 'not a url', '']) {
      expect(isReopenableUrl(url)).toBe(false);
    }
  });

  it('requires long random nonces', () => {
    expect(isNonce('a'.repeat(48))).toBe(true);
    expect(isNonce('short')).toBe(false);
    expect(isNonce({})).toBe(false);
  });
});

describe('stored data validation', () => {
  it('drops malformed notes/tasks and unknown settings without crashing', () => {
    const raw = JSON.parse(`{
      "rev": "1",
      "settings": { "switchTabs": "yes", "isAdmin": true },
      "notes": {
        "__proto__": { "kind": "tab", "tasks": [] },
        "global": { "kind": "tab", "status": "archived", "tasks": [
          { "id": "ok", "text": "fine", "done": true },
          { "id": "bad", "text": { "html": "<img onerror=x>" } },
          { "id": "__proto__", "text": "x" },
          "junk"
        ] }
      }
    }`);
    const s = normalizeState(raw, 1);
    expect(Object.keys(s.notes)).toEqual(['global']);
    expect(Object.getPrototypeOf(s.notes)).toBe(Object.prototype);
    expect(s.notes.global.kind).toBe('global');
    expect(s.notes.global.status).toBe('active');
    expect(s.notes.global.tasks.map((t) => [t.id, t.text])).toEqual([
      ['ok', 'fine'],
      ['bad', ''],
    ]);
    expect(s.settings).toEqual({ switchTabs: false });
    expect(s.rev).toBe(0);
  });
});

describe('geometry', () => {
  it('keeps the panel on screen', () => {
    const r = clampRect({ x: 5000, y: -50, width: 5000, height: 99999 }, 1000, 800);
    expect(r.x).toBeLessThanOrEqual(1000 - 48);
    expect(r.y).toBe(0);
    expect(r.width).toBeLessThanOrEqual(720);
    expect(r.height).toBeLessThanOrEqual(792);
  });
});

// ---------------------------------------------------------------- panel auth

class FakeSession {
  data: Record<string, unknown> = {};
  async get(key: string) {
    return key in this.data ? { [key]: structuredClone(this.data[key]) } : {};
  }
  async set(items: Record<string, unknown>) {
    Object.assign(this.data, structuredClone(items));
  }
  async remove(key: string) {
    delete this.data[key];
  }
}

describe('panel authorization', () => {
  let auth: typeof import('../src/background/auth');
  const NONCE = 'n'.repeat(48);

  beforeEach(async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = { storage: { session: new FakeSession() } };
    auth = await import('../src/background/auth');
  });

  it('authorizes only the frame presenting the host nonce, once', async () => {
    await auth.registerHost(5, NONCE);
    expect(await auth.authorizePanel(5, 'x'.repeat(48), 'doc-evil')).toBe(false);
    expect(await auth.authorizePanel(5, NONCE, 'doc-legit')).toBe(true);
    // Nonce is single-use: a later (e.g. page-framed) panel can't replay it.
    expect(await auth.authorizePanel(5, NONCE, 'doc-evil')).toBe(false);
    expect(await auth.isAuthorizedPanel(5, 'doc-legit')).toBe(true);
    expect(await auth.isAuthorizedPanel(5, 'doc-evil')).toBe(false);
  });

  it('does not let a nonce from one tab authorize another', async () => {
    await auth.registerHost(5, NONCE);
    expect(await auth.authorizePanel(6, NONCE, 'doc')).toBe(false);
  });

  it('revokes authorization when the tab closes', async () => {
    await auth.registerHost(5, NONCE);
    await auth.authorizePanel(5, NONCE, 'doc');
    await auth.clearAuth(5);
    expect(await auth.isAuthorizedPanel(5, 'doc')).toBe(false);
  });
});
