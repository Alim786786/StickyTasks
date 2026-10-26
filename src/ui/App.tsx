import { MoreHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { archivedNotes, findNoteByTab, navigableNotes } from '../shared/model';
import { newId } from '../shared/ids';
import { FRAME_PAD } from '../shared/messages';
import { GLOBAL_NOTE_ID } from '../shared/types';
import { request } from '../panel/bridge';
import type { PanelConnection } from '../panel/connection';
import { AddTask } from './AddTask';
import { ArchiveView } from './ArchiveView';
import { Menu } from './Menu';
import { Navigator } from './Navigator';
import { IconButton, useDismiss } from './primitives';
import { SettingsView } from './SettingsView';
import { TaskList } from './TaskList';
import { useAppState } from './useAppState';

type View = 'list' | 'archive' | 'settings';

const SWITCH_TAB_DELAY_MS = 350;

/** Reports the space the panel needs (including open popovers) so the host can size the iframe. */
function useReportSize(connection: PanelConnection, panelRef: React.RefObject<HTMLDivElement>, active: boolean) {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!active || !panel) return;
    let frame = 0;
    let last = '';
    const measure = () => {
      frame = 0;
      let bottom = panel.getBoundingClientRect().bottom;
      document.querySelectorAll('[data-popover]').forEach((el) => {
        bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
      });
      const msg = { frameHeight: Math.ceil(bottom + FRAME_PAD), panelHeight: panel.offsetHeight };
      const key = `${msg.frameHeight}:${msg.panelHeight}`;
      if (key !== last) {
        last = key;
        connection.post({ t: 'size', ...msg });
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(panel);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [connection, panelRef, active]);
}

/** Pointer drag reported as screen-space deltas; the host moves the iframe. */
function useHostDrag(connection: PanelConnection, mode: 'move' | 'resize') {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if (mode === 'move' && (e.target as HTMLElement).closest('button,input,[role="menu"],[role="menuitem"]')) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.screenX, y: e.screenY };
      connection.post({ t: 'drag', mode, phase: 'start', dx: 0, dy: 0 });
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!start.current) return;
      connection.post({ t: 'drag', mode, phase: 'move', dx: e.screenX - start.current.x, dy: e.screenY - start.current.y });
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (!start.current) return;
      const dx = e.screenX - start.current.x;
      const dy = e.screenY - start.current.y;
      start.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      // A click without movement shouldn't persist a position.
      if (Math.abs(dx) + Math.abs(dy) >= 3) connection.post({ t: 'drag', mode, phase: 'end', dx, dy });
    },
  };
}

export function App({ connection }: { connection: PanelConnection }) {
  const snap = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const { state, dispatch } = useAppState(connection.fail);
  const [view, setView] = useState<View>('list');
  const [menuOpen, setMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const switchTimer = useRef<ReturnType<typeof setTimeout>>();

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuOpen, [menuBtnRef, menuRef], closeMenu);
  const moveDrag = useHostDrag(connection, 'move');
  const resizeDrag = useHostDrag(connection, 'resize');
  const rendered = snap.ready && Boolean(state);
  useReportSize(connection, panelRef, rendered);

  useEffect(() => () => clearTimeout(switchTimer.current), []);
  useEffect(() => {
    if (!snap.visible) setMenuOpen(false);
  }, [snap.visible]);
  useEffect(() => {
    if (snap.showSeq > 0) setView('list');
  }, [snap.showSeq]);

  if (!snap.ready || !state) return null;

  const notes = navigableNotes(state);
  const current = notes.find((n) => n.id === snap.viewNoteId) ?? state.notes[GLOBAL_NOTE_ID];
  const tabNote = findNoteByTab(state, snap.tabId);
  const archived = archivedNotes(state);
  const { layout } = snap;

  const selectNote = (noteId: string) => {
    setView('list');
    connection.setViewNote(noteId);
    clearTimeout(switchTimer.current);
    const note = state.notes[noteId];
    if (state.settings.switchTabs && note?.kind === 'tab' && note.tabId !== snap.tabId) {
      // Debounced so cycling with arrows or the wheel doesn't jump through every tab.
      switchTimer.current = setTimeout(
        () => request({ type: 'note:select', noteId }).catch(connection.fail),
        SWITCH_TAB_DELAY_MS,
      );
    }
  };

  const openTabNote = async () => {
    setMenuOpen(false);
    if (tabNote) return selectNote(tabNote.id);
    try {
      const res = await request({ type: 'tabNote:open' });
      setView('list');
      connection.setViewNote(res.noteId);
    } catch (err) {
      connection.fail(err);
    }
  };

  const setSwitchTabs = (v: boolean) => dispatch({ t: 'settings.set', patch: { switchTabs: v } });

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="StickyTasks"
      className="absolute flex flex-col rounded-2xl border border-[rgba(255,255,255,0.1)] bg-bg text-fg shadow-[0_3px_9px_rgba(0,0,0,0.35),0_1px_3px_rgba(0,0,0,0.3)]"
      style={{
        left: FRAME_PAD,
        top: FRAME_PAD,
        width: layout.width,
        height: layout.height ?? undefined,
        maxHeight: layout.height === null ? layout.maxHeight : undefined,
      }}
    >
      {/* Header doubles as the drag handle. */}
      <div
        className="relative flex h-14 shrink-0 select-none items-center gap-1 border-b border-line pl-4 pr-2"
        onPointerDown={moveDrag.onPointerDown}
        onPointerMove={moveDrag.onPointerMove}
        onPointerUp={moveDrag.onPointerUp}
        onPointerCancel={moveDrag.onPointerUp}
      >
        <span className="flex-1 truncate text-lg font-semibold tracking-[-0.01em]">StickyTasks</span>
        <div ref={menuBtnRef}>
          <IconButton
            label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className={menuOpen ? 'bg-hover text-fg' : ''}
          >
            <MoreHorizontal size={18} />
          </IconButton>
        </div>
        <IconButton label="Close" onClick={() => connection.post({ t: 'close' })}>
          <X size={18} />
        </IconButton>
        {menuOpen && (
          <div ref={menuRef}>
            <Menu
              hasTabNote={Boolean(tabNote)}
              viewingTabNote={Boolean(tabNote && tabNote.id === current.id && view === 'list')}
              archivedCount={archived.length}
              switchTabs={state.settings.switchTabs}
              onTabNote={openTabNote}
              onGlobal={() => {
                setMenuOpen(false);
                selectNote(GLOBAL_NOTE_ID);
              }}
              onArchive={() => {
                setMenuOpen(false);
                setView('archive');
              }}
              onSwitchTabs={setSwitchTabs}
              onSettings={() => {
                setMenuOpen(false);
                setView('settings');
              }}
            />
          </div>
        )}
      </div>

      {view === 'list' && (
        <>
          <Navigator
            notes={notes}
            current={current}
            currentTabId={snap.tabId}
            onSelect={selectNote}
            onRename={(noteId, title) => dispatch({ t: 'note.rename', noteId, title })}
          />
          <div className="st-scroll min-h-0 flex-auto overflow-y-auto px-2 py-1.5">
            <TaskList note={current} dispatch={dispatch} />
            <div ref={listEndRef} />
          </div>
          <AddTask
            onAdd={(text) => {
              dispatch({ t: 'task.add', noteId: current.id, taskId: newId('task'), text });
              requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ block: 'nearest' }));
            }}
          />
        </>
      )}

      {view === 'archive' && (
        <ArchiveView
          notes={archived}
          onBack={() => setView('list')}
          onRestore={async (noteId) => {
            await request({ type: 'archive:restore', noteId });
          }}
          onDelete={(noteId) => dispatch({ t: 'note.delete', noteId })}
        />
      )}

      {view === 'settings' && (
        <SettingsView
          switchTabs={state.settings.switchTabs}
          noteTitle={current.title}
          completedCount={current.tasks.filter((t) => t.done).length}
          onBack={() => setView('list')}
          onSwitchTabs={setSwitchTabs}
          onClearCompleted={() => dispatch({ t: 'note.clearCompleted', noteId: current.id })}
          onResetPosition={() => connection.post({ t: 'resetPosition' })}
        />
      )}

      <div
        aria-hidden
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onPointerDown={resizeDrag.onPointerDown}
        onPointerMove={resizeDrag.onPointerMove}
        onPointerUp={resizeDrag.onPointerUp}
        onPointerCancel={resizeDrag.onPointerUp}
      />
    </div>
  );
}
