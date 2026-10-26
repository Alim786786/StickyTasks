// Page-side host. It deliberately contains no task data and no UI: the panel
// is an extension-origin iframe, so the web page can't read its DOM or observe
// keystrokes typed into it (events inside a cross-origin frame never reach
// the page, unlike events inside a shadow root).
//
// This script only positions the iframe and relays show/hide commands.
import { clampRect, defaultRect, dragRect, maxAutoHeight } from '../shared/geometry';
import {
  FRAME_PAD,
  HELLO_TYPE,
  PANEL_PAGE,
  type Envelope,
  type HostRequest,
  type HostToPanel,
  type PanelCommand,
  type PanelToHost,
  type ResponseMap,
} from '../shared/messages';
import type { PanelRect } from '../shared/types';

const HOST_ATTR = 'data-stickytasks-host';

declare global {
  interface Window {
    __stickyTasks?: { alive: () => boolean };
  }
}

function extensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

async function send<K extends HostRequest['type']>(req: Extract<HostRequest, { type: K }>): Promise<ResponseMap[K]> {
  const res: Envelope<ResponseMap[K]> | undefined = await chrome.runtime.sendMessage(req);
  if (!res?.ok) throw new Error(res?.error ?? 'No response');
  return res.data;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function mount() {
  // A host left behind by a previous (reloaded) extension version is inert; replace it.
  document.querySelectorAll(`[${HOST_ATTR}]`).forEach((el) => el.remove());

  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, '');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;display:block;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const frame = document.createElement('iframe');
  frame.title = 'StickyTasks';
  frame.setAttribute('aria-label', 'StickyTasks');
  frame.style.cssText =
    'all:initial;position:fixed;display:none;border:0;margin:0;padding:0;background:transparent;color-scheme:normal;';
  shadow.append(frame);

  const nonce = randomNonce();
  const extOrigin = new URL(chrome.runtime.getURL('')).origin;
  let port: MessagePort | null = null;
  let visible = false;
  let rect: PanelRect | null = null;
  let frameHeight = 0;
  let panelHeight = 0;
  let drag: { start: PanelRect } | null = null;
  let pendingShow: string | undefined;

  const post = (msg: HostToPanel) => port?.postMessage(msg);
  const persist = (patch: { visible?: boolean; rect?: PanelRect | null }) =>
    send({ type: 'ui:set', patch }).catch(() => (extensionAlive() ? undefined : destroy()));

  const current = () => clampRect(rect ?? defaultRect(window.innerWidth), window.innerWidth, window.innerHeight);

  const layout = () => {
    const r = current();
    const maxHeight = maxAutoHeight(r, window.innerHeight);
    const box = r.height ?? Math.min(panelHeight || 200, maxHeight);
    const height = Math.max(frameHeight, box + 2 * FRAME_PAD);
    Object.assign(frame.style, {
      display: visible ? 'block' : 'none',
      left: `${r.x - FRAME_PAD}px`,
      top: `${r.y - FRAME_PAD}px`,
      width: `${r.width + 2 * FRAME_PAD}px`,
      height: `${height}px`,
    });
    post({ t: 'layout', width: r.width, height: r.height, maxHeight });
  };

  const setVisible = (v: boolean) => {
    visible = v;
    layout();
    post({ t: 'visible', visible });
    persist({ visible });
  };

  // Port messages come only from our authenticated panel frame.
  const onPanelMessage = (e: MessageEvent<PanelToHost>) => {
    const m = e.data;
    switch (m?.t) {
      case 'size':
        if (Number.isFinite(m.frameHeight) && Number.isFinite(m.panelHeight)) {
          frameHeight = Math.min(Math.max(0, m.frameHeight), 4000);
          panelHeight = Math.min(Math.max(0, m.panelHeight), 4000);
          layout();
        }
        break;
      case 'drag': {
        if (!Number.isFinite(m.dx) || !Number.isFinite(m.dy)) break;
        if (m.phase === 'start') {
          const r = current();
          drag = { start: m.mode === 'resize' && r.height === null ? { ...r, height: panelHeight } : r };
          break;
        }
        if (!drag) break;
        rect = clampRect(dragRect(drag.start, m.mode, m.dx, m.dy), window.innerWidth, window.innerHeight);
        layout();
        if (m.phase === 'end') {
          drag = null;
          persist({ rect });
        }
        break;
      }
      case 'close':
        setVisible(false);
        break;
      case 'resetPosition':
        rect = null;
        layout();
        persist({ rect: null });
        break;
    }
  };

  frame.addEventListener('load', () => {
    if (port) return;
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = onPanelMessage;
    // targetOrigin = our extension origin: the nonce and port can only be
    // delivered to our own panel document, never to a page-controlled frame.
    frame.contentWindow?.postMessage({ type: HELLO_TYPE, nonce }, extOrigin, [channel.port2]);
    layout();
    post({ t: 'visible', visible });
    if (pendingShow !== undefined) post({ t: 'show', noteId: pendingShow || undefined });
    pendingShow = undefined;
  });

  const onResize = () => layout();
  window.addEventListener('resize', onResize);

  const ready = (async () => {
    // Register the nonce before the frame loads so the panel can authenticate.
    const res = await send({ type: 'host:init', nonce });
    rect = res.ui.rect;
    frame.src = chrome.runtime.getURL(PANEL_PAGE);
    document.documentElement.appendChild(host);
  })();

  const onMessage = (cmd: PanelCommand, sender: chrome.runtime.MessageSender, respond: (r: boolean) => void) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return; // only from our service worker
    if (cmd?.type !== 'panel:toggle' && cmd?.type !== 'panel:show') return;
    ready
      .then(() => {
        if (cmd.type === 'panel:toggle') return setVisible(!visible);
        const noteId = typeof cmd.noteId === 'string' ? cmd.noteId : undefined;
        if (port) post({ t: 'show', noteId });
        else pendingShow = noteId ?? '';
        if (!visible) setVisible(true);
      })
      .catch(() => undefined);
    respond(true);
  };

  let destroyed = false;
  function destroy() {
    destroyed = true;
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {
      // Context already gone.
    }
    window.removeEventListener('resize', onResize);
    port?.close();
    host.remove();
    window.__stickyTasks = undefined;
  }

  chrome.runtime.onMessage.addListener(onMessage);
  window.__stickyTasks = { alive: () => extensionAlive() && !destroyed };
  ready.catch(() => destroy());
}

// Guard against duplicate injection into the same page.
if (!window.__stickyTasks?.alive()) mount();
