import {
  applyOp,
  archiveDetachedInWindow,
  attachDetachedByUrl,
  createTabNote,
  findNoteByTab,
  handleTabAttached,
  handleTabRemoved,
  handleTabReplaced,
  handleTabUrl,
  reconcile,
  restoreNote,
  sweepDetached,
} from '../shared/model';
import type { Envelope, HostRequest, PanelRequest, ResponseMap } from '../shared/messages';
import { newId } from '../shared/ids';
import { displayHost, isRestrictedUrl } from '../shared/url';
import { isNonce, isReopenableUrl, parseOp, parseUiPatch } from '../shared/validate';
import { authorizePanel, clearAuth, isAuthorizedPanel, registerHost } from './auth';
import { Store } from './store';
import { flagUnavailable, sendPanelCommand } from './injector';
import { getPanelUi, movePanelUi, removePanelUi, setPanelUi } from './panelState';
import { focusTab, queryAllTabs } from './tabs';
import { senderRole } from './sender';

const store = new Store(chrome.storage.local);

// Content scripts never need direct storage access: all reads/writes go through
// the service worker or the extension-origin panel frame. Restrict both areas
// to trusted contexts (best effort; older Chrome versions only support session).
for (const area of [chrome.storage.session, chrome.storage.local]) {
  try {
    area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' as chrome.storage.AccessLevel }).catch(() => undefined);
  } catch {
    // Unsupported for this area.
  }
}

// ------------------------------------------------------------ boot / session

const SESSION_MARKER = 'session:started';
let booted = false;

/**
 * First work after the service worker starts. chrome.storage.session is empty
 * after a browser restart, which tells us stored tab IDs are meaningless and
 * notes must be re-matched to restored tabs by URL.
 */
async function ensureBooted(): Promise<void> {
  if (booted) return;
  const marker = await chrome.storage.session.get(SESSION_MARKER);
  const newSession = !marker[SESSION_MARKER];
  const tabs = await queryAllTabs();
  await store.apply((s, now) => sweepDetached(reconcile(s, tabs, newSession, now), now));
  if (newSession) await chrome.storage.session.set({ [SESSION_MARKER]: Date.now() });
  booted = true;
}

/** Serialized unit of work; boot reconciliation always runs first. */
function tx<T>(fn: () => Promise<T>): Promise<T> {
  return store.exclusive(async () => {
    await ensureBooted();
    return fn();
  });
}

const run = (fn: () => Promise<unknown>) => {
  tx(fn).catch((err) => console.warn('[StickyTasks]', err));
};

// ------------------------------------------------------------ tab lifecycle

chrome.runtime.onStartup.addListener(() => run(async () => undefined));
chrome.runtime.onInstalled.addListener(() => run(async () => undefined));

chrome.tabs.onRemoved.addListener((tabId, info) => {
  run(() => store.apply((s, now) => handleTabRemoved(s, tabId, info.isWindowClosing, now)));
  removePanelUi(tabId).catch(() => undefined);
  clearAuth(tabId).catch(() => undefined);
});

chrome.windows.onRemoved.addListener((windowId) => {
  run(async () => {
    // If other windows remain, the browser is still running and this window
    // was closed on purpose. Otherwise it may be quitting: leave the notes
    // detached so session restore can reconnect them.
    const remaining = await chrome.windows.getAll();
    if (remaining.length > 0) await store.apply((s, now) => archiveDetachedInWindow(s, windowId, now));
  });
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  run(() => store.apply((s) => handleTabReplaced(s, addedTabId, removedTabId)));
  movePanelUi(removedTabId, addedTabId).catch(() => undefined);
  clearAuth(removedTabId).catch(() => undefined);
});

chrome.tabs.onAttached.addListener((tabId, info) => {
  run(() => store.apply((s) => handleTabAttached(s, tabId, info.newWindowId)));
});

chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.url || tab.pendingUrl;
  if (tab.id === undefined || !url) return;
  const info = { id: tab.id, windowId: tab.windowId, url };
  run(() => store.apply((s, now) => attachDetachedByUrl(s, info, now)));
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) {
    const info = { id: tabId, windowId: tab.windowId, url: change.url };
    run(() =>
      store.apply((s, now) => attachDetachedByUrl(handleTabUrl(s, tabId, change.url!, tab.windowId), info, now)),
    );
  }
  // Re-show the panel after a reload/navigation if it was open in this tab.
  if (change.status === 'complete' && !isRestrictedUrl(tab.url)) {
    getPanelUi(tabId)
      .then((ui) => (ui.visible ? sendPanelCommand(tabId, { type: 'panel:show' }) : false))
      .catch(() => undefined);
  }
});

// ------------------------------------------------------------ toolbar button

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  const ok = !isRestrictedUrl(tab.url) && (await sendPanelCommand(tab.id, { type: 'panel:toggle' }));
  if (!ok) await flagUnavailable(tab.id);
});

// ------------------------------------------------------------ messages
//
// Every payload is untrusted input: content scripts share a process with the
// web page. Requests are dispatched by sender role and validated field by field.

class RequestError extends Error {}

const invalid = () => new RequestError('Invalid request');

type Ctx = { tab: chrome.tabs.Tab & { id: number } };

const hostHandlers: {
  [K in HostRequest['type']]: (raw: Record<string, unknown>, ctx: Ctx) => Promise<ResponseMap[K]>;
} = {
  'host:init': async (raw, { tab }) => {
    if (!isNonce(raw.nonce)) throw invalid();
    await registerHost(tab.id, raw.nonce);
    return { ui: await getPanelUi(tab.id) };
  },
  'ui:set': async (raw, { tab }) => {
    const patch = parseUiPatch(raw.patch, 'host');
    if (!patch) throw invalid();
    await setPanelUi(tab.id, patch);
    return null;
  },
};

const panelHandlers: {
  [K in Exclude<PanelRequest['type'], 'panel:init'>]: (
    raw: Record<string, unknown>,
    ctx: Ctx,
  ) => Promise<ResponseMap[K]>;
} = {
  'ui:set': async (raw, { tab }) => {
    const patch = parseUiPatch(raw.patch, 'panel');
    if (!patch) throw invalid();
    await setPanelUi(tab.id, patch);
    return null;
  },

  op: async (raw) => {
    const op = parseOp(raw.op);
    if (!op) throw invalid();
    const s = await tx(() => store.apply((st, now) => applyOp(st, op, now)));
    return { rev: s.rev };
  },

  'tabNote:open': async (_raw, { tab }) => {
    // URL and title come from Chrome's view of the sender tab, never from the payload.
    const result = await tx(async () => {
      const s = await store.apply((st, now) =>
        createTabNote(
          st,
          {
            noteId: newId('note'),
            tabId: tab.id,
            windowId: tab.windowId,
            url: tab.url ?? '',
            title: tab.title || displayHost(tab.url ?? '') || 'Tab note',
          },
          now,
        ),
      );
      return { noteId: findNoteByTab(s, tab.id)!.id, rev: s.rev };
    });
    await setPanelUi(tab.id, { viewNoteId: result.noteId });
    return result;
  },

  'note:select': async (raw, { tab }) => {
    const parsed = parseUiPatch({ viewNoteId: raw.noteId }, 'panel');
    if (!parsed?.viewNoteId) throw invalid();
    const s = await tx(() => store.read());
    const note = s.notes[parsed.viewNoteId];
    await setPanelUi(tab.id, { viewNoteId: parsed.viewNoteId });
    // Tab focus happens only for the user's own setting and only for live tab notes.
    if (!s.settings.switchTabs || !note || note.kind !== 'tab' || note.status !== 'active') return null;
    if (note.tabId === null || note.windowId === null || note.tabId === tab.id || note.detachedAt !== null) return null;
    await setPanelUi(note.tabId, { visible: true, viewNoteId: note.id });
    if (await focusTab(note.tabId, note.windowId)) {
      await sendPanelCommand(note.tabId, { type: 'panel:show', noteId: note.id });
    }
    return null;
  },

  'archive:restore': async (raw) => {
    const parsed = parseUiPatch({ viewNoteId: raw.noteId }, 'panel');
    if (!parsed?.viewNoteId) throw invalid();
    const noteId = parsed.viewNoteId;
    return tx(async () => {
      const s = await store.read();
      const note = s.notes[noteId];
      if (!note || note.kind !== 'tab') throw new RequestError('Note not found');
      // Already restored (e.g. double click or another panel): just focus it.
      if (note.status === 'active' && note.tabId !== null && note.windowId !== null) {
        await focusTab(note.tabId, note.windowId);
        return { tabId: note.tabId };
      }
      const url = note.url || note.originalUrl;
      if (!isReopenableUrl(url)) throw new RequestError('This page can’t be reopened');
      const created = await chrome.tabs.create({ url, active: true });
      if (created.id === undefined) throw new RequestError('Could not open tab');
      await store.apply((st, now) =>
        restoreNote(st, note.id, { id: created.id!, windowId: created.windowId, url }, now),
      );
      await setPanelUi(created.id, { visible: true, viewNoteId: note.id });
      return { tabId: created.id };
    });
  },
};

const docId = (sender: chrome.runtime.MessageSender) => sender.documentId ?? `frame:${sender.frameId}`;

async function dispatch(msg: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const role = senderRole(sender, chrome.runtime.id, chrome.runtime.getURL(''));
  if (!role || typeof msg !== 'object' || msg === null) throw invalid();
  const raw = msg as Record<string, unknown>;
  const type = raw.type;
  if (typeof type !== 'string') throw invalid();
  const ctx: Ctx = { tab: sender.tab as Ctx['tab'] };

  if (role === 'host') {
    if (!Object.hasOwn(hostHandlers, type)) throw invalid();
    return hostHandlers[type as HostRequest['type']](raw, ctx);
  }

  if (type === 'panel:init') {
    if (!isNonce(raw.nonce) || !(await authorizePanel(ctx.tab.id, raw.nonce, docId(sender)))) {
      throw new RequestError('Unauthorized');
    }
    await tx(() => store.apply((s, now) => sweepDetached(s, now)));
    return { tabId: ctx.tab.id, ui: await getPanelUi(ctx.tab.id) } satisfies ResponseMap['panel:init'];
  }
  if (!Object.hasOwn(panelHandlers, type)) throw invalid();
  if (!(await isAuthorizedPanel(ctx.tab.id, docId(sender)))) throw new RequestError('Unauthorized');
  return panelHandlers[type as keyof typeof panelHandlers](raw, ctx);
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  dispatch(msg, sender).then(
    (data) => sendResponse({ ok: true, data } satisfies Envelope<unknown>),
    (err: unknown) => {
      // Don't leak internal error details to untrusted senders.
      const error = err instanceof RequestError ? err.message : 'Request failed';
      if (!(err instanceof RequestError)) console.warn('[StickyTasks]', err);
      sendResponse({ ok: false, error } satisfies Envelope<unknown>);
    },
  );
  return true;
});
