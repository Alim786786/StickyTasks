// Runtime validation for anything crossing a trust boundary (messages from
// content scripts/panel frames, data loaded from storage). Content scripts run
// inside web-page renderer processes, so their messages are treated as untrusted.
import { isSafeId, MAX_TASK_LENGTH, MAX_TITLE_LENGTH, type Op } from './model';
import type { PanelRect, PanelUi } from './types';

const MAX_INDEX = 100_000;
const MAX_COORD = 100_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = isSafeId;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max * 2;
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_INDEX;
const isCoord = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_COORD;

/** Returns a clean copy of the op containing only known fields, or null if invalid. */
export function parseOp(raw: unknown): Op | null {
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  switch (raw.t) {
    case 'task.add':
      if (!isId(raw.noteId) || !isId(raw.taskId) || !isText(raw.text, MAX_TASK_LENGTH)) return null;
      if (raw.index !== undefined && !isIndex(raw.index)) return null;
      return { t: 'task.add', noteId: raw.noteId, taskId: raw.taskId, text: raw.text, index: raw.index as number | undefined };
    case 'task.update': {
      if (!isId(raw.noteId) || !isId(raw.taskId)) return null;
      if (raw.text !== undefined && !isText(raw.text, MAX_TASK_LENGTH)) return null;
      if (raw.done !== undefined && typeof raw.done !== 'boolean') return null;
      const op: Op = { t: 'task.update', noteId: raw.noteId, taskId: raw.taskId };
      if (raw.text !== undefined) op.text = raw.text as string;
      if (raw.done !== undefined) op.done = raw.done as boolean;
      return op;
    }
    case 'task.delete':
      return isId(raw.noteId) && isId(raw.taskId) ? { t: 'task.delete', noteId: raw.noteId, taskId: raw.taskId } : null;
    case 'task.move':
      return isId(raw.noteId) && isId(raw.taskId) && isIndex(raw.toIndex)
        ? { t: 'task.move', noteId: raw.noteId, taskId: raw.taskId, toIndex: raw.toIndex }
        : null;
    case 'note.clearCompleted':
      return isId(raw.noteId) ? { t: 'note.clearCompleted', noteId: raw.noteId } : null;
    case 'note.rename':
      return isId(raw.noteId) && isText(raw.title, MAX_TITLE_LENGTH)
        ? { t: 'note.rename', noteId: raw.noteId, title: raw.title }
        : null;
    case 'note.delete':
      return isId(raw.noteId) ? { t: 'note.delete', noteId: raw.noteId } : null;
    case 'settings.set': {
      // Allowlist: unknown setting keys are never persisted.
      if (!isObj(raw.patch) || typeof raw.patch.switchTabs !== 'boolean') return null;
      return { t: 'settings.set', patch: { switchTabs: raw.patch.switchTabs } };
    }
    default:
      return null;
  }
}

export function parseRect(raw: unknown): PanelRect | null | undefined {
  if (raw === null) return null;
  if (!isObj(raw) || !isCoord(raw.x) || !isCoord(raw.y) || !isCoord(raw.width)) return undefined;
  if (raw.height !== null && !isCoord(raw.height)) return undefined;
  return { x: raw.x, y: raw.y, width: raw.width, height: raw.height as number | null };
}

/**
 * Validates a per-tab UI patch. Each sender may only change the fields it
 * owns: the page-side host controls visibility/geometry, the panel frame
 * controls which note is shown.
 */
export function parseUiPatch(raw: unknown, role: 'host' | 'panel'): Partial<PanelUi> | null {
  if (!isObj(raw)) return null;
  const patch: Partial<PanelUi> = {};
  if (role === 'host') {
    if ('visible' in raw) {
      if (typeof raw.visible !== 'boolean') return null;
      patch.visible = raw.visible;
    }
    if ('rect' in raw) {
      const rect = parseRect(raw.rect);
      if (rect === undefined) return null;
      patch.rect = rect;
    }
  } else if ('viewNoteId' in raw) {
    if (!isId(raw.viewNoteId)) return null;
    patch.viewNoteId = raw.viewNoteId;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function isNonce(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(v);
}

/** Only these schemes may be reopened from the archive. */
export function isReopenableUrl(url: string): boolean {
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
