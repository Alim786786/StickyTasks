import type { Op } from './model';
import type { PanelUi } from './types';

/**
 * Requests to the service worker. Two sender roles exist:
 *  - host:  the content script in the page's top frame (untrusted renderer);
 *           only manages panel visibility/geometry for its own tab.
 *  - panel: the extension-origin panel iframe, authorized per tab via a
 *           one-time nonce that only the host knows.
 */
export type HostRequest =
  | { type: 'host:init'; nonce: string }
  | { type: 'ui:set'; patch: Partial<PanelUi> };

export type PanelRequest =
  | { type: 'panel:init'; nonce: string }
  | { type: 'ui:set'; patch: Partial<PanelUi> }
  | { type: 'op'; op: Op }
  | { type: 'tabNote:open' }
  | { type: 'note:select'; noteId: string }
  | { type: 'archive:restore'; noteId: string };

export type Request = HostRequest | PanelRequest;

export interface ResponseMap {
  'host:init': { ui: PanelUi };
  'panel:init': { tabId: number; ui: PanelUi };
  'ui:set': null;
  op: { rev: number };
  'tabNote:open': { noteId: string; rev: number };
  'note:select': null;
  'archive:restore': { tabId: number };
}

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

/** Service worker -> content script. */
export type PanelCommand = { type: 'panel:toggle' } | { type: 'panel:show'; noteId?: string };

/** Content script -> panel iframe (over a private MessagePort). */
export type HostToPanel =
  | { t: 'layout'; width: number; height: number | null; maxHeight: number }
  | { t: 'visible'; visible: boolean }
  | { t: 'show'; noteId?: string };

/** Panel iframe -> content script (over a private MessagePort). */
export type PanelToHost =
  | { t: 'drag'; mode: 'move' | 'resize'; phase: 'start' | 'move' | 'end'; dx: number; dy: number }
  /** frameHeight: height the iframe needs (panel plus any open popover); panelHeight: the panel box itself. */
  | { t: 'size'; frameHeight: number; panelHeight: number }
  | { t: 'close' }
  | { t: 'resetPosition' };

export const HELLO_TYPE = 'stickytasks:hello';
export const PANEL_PAGE = 'panel.html';
/** Transparent margin around the panel inside the iframe, so its shadow isn't clipped. */
export const FRAME_PAD = 12;

export const STATE_KEY = 'stickytasks:state';
