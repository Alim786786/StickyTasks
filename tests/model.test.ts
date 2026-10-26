import { describe, expect, it } from 'vitest';
import {
  applyOp,
  archiveDetachedInWindow,
  archivedNotes,
  attachDetachedByUrl,
  createInitialState,
  createTabNote,
  DETACH_GRACE_MS,
  findNoteByTab,
  handleTabRemoved,
  handleTabReplaced,
  handleTabUrl,
  navigableNotes,
  normalizeState,
  reconcile,
  restoreNote,
  sweepDetached,
} from '../src/shared/model';
import { GLOBAL_NOTE_ID, type AppState } from '../src/shared/types';

const T0 = 1_700_000_000_000;

function withTabNote(state = createInitialState(T0), tabId = 10, url = 'https://example.com/a', noteId = `n${tabId}`) {
  return createTabNote(state, { noteId, tabId, windowId: 1, url, title: 'Example' }, T0);
}

function addTask(state: AppState, noteId: string, taskId: string, text: string) {
  return applyOp(state, { t: 'task.add', noteId, taskId, text }, T0);
}

describe('task operations', () => {
  it('adds, edits, completes and deletes tasks on the global list', () => {
    let s = addTask(createInitialState(T0), GLOBAL_NOTE_ID, 't1', '  Write   tests ');
    expect(s.notes.global.tasks.map((t) => t.text)).toEqual(['Write tests']);

    s = applyOp(s, { t: 'task.update', noteId: GLOBAL_NOTE_ID, taskId: 't1', done: true }, T0);
    expect(s.notes.global.tasks[0].done).toBe(true);

    s = applyOp(s, { t: 'task.update', noteId: GLOBAL_NOTE_ID, taskId: 't1', text: 'Write more tests' }, T0);
    expect(s.notes.global.tasks[0].text).toBe('Write more tests');

    s = applyOp(s, { t: 'task.delete', noteId: GLOBAL_NOTE_ID, taskId: 't1' }, T0);
    expect(s.notes.global.tasks).toHaveLength(0);
  });

  it('ignores empty tasks and duplicate IDs (idempotent replays)', () => {
    const s0 = createInitialState(T0);
    expect(addTask(s0, GLOBAL_NOTE_ID, 't1', '   ')).toBe(s0);
    const s1 = addTask(s0, GLOBAL_NOTE_ID, 't1', 'Once');
    expect(addTask(s1, GLOBAL_NOTE_ID, 't1', 'Once')).toBe(s1);
  });

  it('reorders tasks', () => {
    let s = createInitialState(T0);
    for (const id of ['a', 'b', 'c']) s = addTask(s, GLOBAL_NOTE_ID, id, id);
    s = applyOp(s, { t: 'task.move', noteId: GLOBAL_NOTE_ID, taskId: 'c', toIndex: 0 }, T0);
    expect(s.notes.global.tasks.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('never deletes the global list or active notes', () => {
    const s = withTabNote();
    expect(applyOp(s, { t: 'note.delete', noteId: GLOBAL_NOTE_ID }, T0)).toBe(s);
    expect(applyOp(s, { t: 'note.delete', noteId: 'n10' }, T0)).toBe(s);
  });
});

describe('tab note lifecycle', () => {
  it('creates at most one note per tab and lists it after Global', () => {
    let s = withTabNote();
    s = createTabNote(s, { noteId: 'other', tabId: 10, windowId: 1, url: 'x', title: 'x' }, T0);
    expect(Object.keys(s.notes)).toEqual([GLOBAL_NOTE_ID, 'n10']);
    expect(navigableNotes(s).map((n) => n.id)).toEqual([GLOBAL_NOTE_ID, 'n10']);
  });

  it('keeps notes for different tabs on the same site independent', () => {
    let s = withTabNote(undefined, 10, 'https://example.com/a', 'n10');
    s = withTabNote(s, 11, 'https://example.com/a', 'n11');
    s = addTask(s, 'n10', 't1', 'only in tab 10');
    expect(s.notes.n11.tasks).toHaveLength(0);
  });

  it('archives the note with its tasks when the tab is closed', () => {
    let s = addTask(withTabNote(), 'n10', 't1', 'keep me');
    s = handleTabRemoved(s, 10, false, T0 + 5);
    expect(s.notes.n10.status).toBe('archived');
    expect(s.notes.n10.tasks).toHaveLength(1);
    expect(navigableNotes(s).map((n) => n.id)).toEqual([GLOBAL_NOTE_ID]);
    expect(archivedNotes(s).map((n) => n.id)).toEqual(['n10']);
  });

  it('does not archive on reload/navigation or discard (tab replaced)', () => {
    let s = withTabNote();
    s = handleTabUrl(s, 10, 'https://example.com/b');
    expect(s.notes.n10.status).toBe('active');
    expect(s.notes.n10.url).toBe('https://example.com/b');
    expect(s.notes.n10.originalUrl).toBe('https://example.com/a');

    s = handleTabReplaced(s, 99, 10);
    expect(findNoteByTab(s, 99)?.id).toBe('n10');
    expect(s.notes.n10.status).toBe('active');
  });

  it('defers archiving when the whole window closes, then archives if the browser keeps running', () => {
    let s = handleTabRemoved(withTabNote(), 10, true, T0);
    expect(s.notes.n10.status).toBe('active');
    expect(s.notes.n10.detachedAt).toBe(T0);
    expect(navigableNotes(s).map((n) => n.id)).toEqual([GLOBAL_NOTE_ID]);

    s = archiveDetachedInWindow(s, 1, T0 + 1);
    expect(s.notes.n10.status).toBe('archived');
    expect(s.notes.n10.archiveReason).toBe('window-closed');
  });

  it('restores an archived note into a new tab exactly once', () => {
    let s = addTask(withTabNote(), 'n10', 't1', 'task');
    s = handleTabRemoved(s, 10, false, T0);
    s = restoreNote(s, 'n10', { id: 20, windowId: 2, url: 'https://example.com/a' }, T0 + 1);
    expect(s.notes.n10.status).toBe('active');
    expect(findNoteByTab(s, 20)?.tasks).toHaveLength(1);

    // A second restore of the same note is a no-op.
    const again = restoreNote(s, 'n10', { id: 21, windowId: 2, url: 'https://example.com/a' }, T0 + 2);
    expect(again).toBe(s);
  });
});

describe('session restore', () => {
  it('rebinds notes to restored tabs by URL after a browser restart', () => {
    let s = withTabNote(undefined, 10, 'https://example.com/a#section', 'n10');
    s = withTabNote(s, 11, 'https://other.dev/', 'n11');
    // New session: tab IDs changed; one tab has not been restored yet.
    s = reconcile(s, [{ id: 501, windowId: 7, url: 'https://example.com/a' }], true, T0 + 1000);
    expect(s.notes.n10.tabId).toBe(501);
    expect(s.notes.n10.detachedAt).toBeNull();
    expect(s.notes.n11.status).toBe('active');
    expect(s.notes.n11.detachedAt).toBe(T0 + 1000);

    // The missing tab is restored a bit later.
    s = attachDetachedByUrl(s, { id: 502, windowId: 7, url: 'https://other.dev/' }, T0 + 2000);
    expect(s.notes.n11.tabId).toBe(502);
    expect(navigableNotes(s)).toHaveLength(3);
  });

  it('does not trust a reused tab ID with a different URL after restart', () => {
    let s = withTabNote(undefined, 10, 'https://example.com/a');
    s = reconcile(s, [{ id: 10, windowId: 1, url: 'https://unrelated.com/' }], true, T0);
    expect(s.notes.n10.tabId).toBeNull();
    expect(s.notes.n10.detachedAt).toBe(T0);
  });

  it('archives (never deletes) notes whose tabs do not come back', () => {
    let s = addTask(withTabNote(), 'n10', 't1', 'precious');
    s = reconcile(s, [], true, T0);
    expect(sweepDetached(s, T0 + DETACH_GRACE_MS - 1)).toBe(s);
    s = sweepDetached(s, T0 + DETACH_GRACE_MS);
    expect(s.notes.n10.status).toBe('archived');
    expect(s.notes.n10.tasks[0].text).toBe('precious');
  });

  it('within a session, keeps notes on navigated tabs and archives missed closes', () => {
    let s = withTabNote(undefined, 10, 'https://example.com/a', 'n10');
    s = withTabNote(s, 11, 'https://example.com/b', 'n11');
    s = reconcile(s, [{ id: 10, windowId: 1, url: 'https://example.com/navigated' }], false, T0);
    expect(s.notes.n10.status).toBe('active');
    expect(s.notes.n10.url).toBe('https://example.com/navigated');
    expect(s.notes.n11.status).toBe('archived');
  });
});

describe('normalizeState', () => {
  it('creates initial state and repairs a missing global note without dropping data', () => {
    expect(normalizeState(undefined, T0).notes.global).toBeDefined();
    const s = withTabNote();
    const { [GLOBAL_NOTE_ID]: _omit, ...rest } = s.notes;
    const repaired = normalizeState({ ...s, notes: rest }, T0);
    expect(repaired.notes.global.kind).toBe('global');
    expect(repaired.notes.n10.title).toBe('Example');
  });
});
