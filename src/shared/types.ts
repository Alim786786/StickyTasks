export const GLOBAL_NOTE_ID = 'global';
export const SCHEMA_VERSION = 1;

export interface Task {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NoteKind = 'global' | 'tab';
export type NoteStatus = 'active' | 'archived';
export type ArchiveReason = 'tab-closed' | 'window-closed' | 'session-lost';

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  /** URL of the page when the note was created. */
  originalUrl: string;
  /** Last known URL of the bound tab; used for restore and session matching. */
  url: string;
  tabId: number | null;
  windowId: number | null;
  tasks: Task[];
  status: NoteStatus;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  archiveReason: ArchiveReason | null;
  /**
   * Set while a note's tab is gone but may come back (window closing, browser
   * restart). Detached notes are hidden from navigation and are archived once
   * the grace period ends without a matching tab reappearing.
   */
  detachedAt: number | null;
}

export interface Settings {
  switchTabs: boolean;
}

export interface AppState {
  version: number;
  /** Incremented on every write; lets panels discard stale optimistic state. */
  rev: number;
  notes: Record<string, Note>;
  settings: Settings;
}

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number | null;
}

/** Per-tab panel UI state, kept in chrome.storage.session. */
export interface PanelUi {
  visible: boolean;
  viewNoteId: string;
  rect: PanelRect | null;
}

export interface TabInfo {
  id: number;
  windowId: number;
  url: string;
}
