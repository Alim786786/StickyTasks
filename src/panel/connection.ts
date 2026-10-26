import { MAX_AUTO_HEIGHT, DEFAULT_WIDTH } from '../shared/geometry';
import { HELLO_TYPE, type HostToPanel, type PanelToHost } from '../shared/messages';
import { GLOBAL_NOTE_ID } from '../shared/types';
import { isNonce } from '../shared/validate';
import { request } from './bridge';

export interface PanelSnapshot {
  ready: boolean;
  tabId: number;
  visible: boolean;
  viewNoteId: string;
  /** Incremented when the host asks to show a note, so the UI can return to the list. */
  showSeq: number;
  layout: { width: number; height: number | null; maxHeight: number };
}

/**
 * The panel's link to its host content script and the service worker.
 *
 * Any page can frame panel.html and post messages to it, so nothing renders
 * until a hello message carries a nonce the service worker confirms was
 * registered by this tab's host. Only then is the accompanying MessagePort
 * trusted for layout traffic.
 */
export class PanelConnection {
  private snapshot: PanelSnapshot = {
    ready: false,
    tabId: -1,
    visible: false,
    viewNoteId: GLOBAL_NOTE_ID,
    showSeq: 0,
    layout: { width: DEFAULT_WIDTH, height: null, maxHeight: MAX_AUTO_HEIGHT },
  };
  private listeners = new Set<() => void>();
  private port: MessagePort | null = null;

  constructor() {
    window.addEventListener('message', this.onHello);
  }

  private onHello = async (e: MessageEvent) => {
    const data = e.data as { type?: unknown; nonce?: unknown } | null;
    const port = e.ports?.[0];
    if (this.port || !port || data?.type !== HELLO_TYPE || !isNonce(data.nonce)) return;
    try {
      const res = await request({ type: 'panel:init', nonce: data.nonce });
      if (this.port) return port.close();
      this.port = port;
      window.removeEventListener('message', this.onHello);
      port.onmessage = (m: MessageEvent<HostToPanel>) => this.onHostMessage(m.data);
      this.update({ ready: true, tabId: res.tabId, viewNoteId: res.ui.viewNoteId });
    } catch {
      port.close(); // forged or stale nonce
    }
  };

  private onHostMessage(m: HostToPanel) {
    switch (m?.t) {
      case 'layout':
        this.update({ layout: { width: m.width, height: m.height, maxHeight: m.maxHeight } });
        break;
      case 'visible':
        this.update({ visible: m.visible });
        break;
      case 'show':
        this.update({
          visible: true,
          showSeq: this.snapshot.showSeq + 1,
          ...(typeof m.noteId === 'string' ? { viewNoteId: m.noteId } : {}),
        });
        break;
    }
  }

  private update(patch: Partial<PanelSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = () => this.snapshot;

  post(msg: PanelToHost) {
    this.port?.postMessage(msg);
  }

  setViewNote(noteId: string) {
    this.update({ viewNoteId: noteId });
    request({ type: 'ui:set', patch: { viewNoteId: noteId } }).catch(this.fail);
  }

  fail = (err: unknown) => {
    console.warn('[StickyTasks]', err);
  };
}
