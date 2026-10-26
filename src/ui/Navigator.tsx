import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Note } from '../shared/types';
import { displayHost } from '../shared/url';
import { cx, IconButton, useDismiss } from './primitives';

interface Props {
  notes: Note[];
  current: Note;
  currentTabId: number;
  onSelect: (noteId: string) => void;
  onRename: (noteId: string, title: string) => void;
}

const WHEEL_STEP = 60;

export function Navigator({ notes, current, currentTabId, onSelect, onRename }: Props) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const rowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const index = Math.max(0, notes.findIndex((n) => n.id === current.id));
  const canCycle = notes.length > 1;

  const step = useRef<(delta: number) => void>(() => undefined);
  step.current = (delta: number) => {
    if (!canCycle) return;
    onSelect(notes[(index + delta + notes.length) % notes.length].id);
  };

  useDismiss(open, [rowRef, listRef], () => setOpen(false));

  // Native listener: React's wheel handlers are passive and can't preventDefault.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(acc) >= WHEEL_STEP) {
        step.current(acc > 0 ? 1 : -1);
        acc = 0;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const commitRename = () => {
    setRenaming(false);
    if (draft.trim() && draft.trim() !== current.title) onRename(current.id, draft);
  };

  return (
    <div ref={rowRef} className="relative flex h-11 shrink-0 items-center border-b border-line px-2">
      <IconButton label="Previous note" onClick={() => step.current(-1)} disabled={!canCycle}>
        <ChevronLeft size={18} />
      </IconButton>

      <div className="flex min-w-0 flex-1 justify-center">
        {renaming ? (
          <input
            autoFocus
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="h-8 w-full rounded-md bg-hover px-2 text-center text-base"
            aria-label="Rename note"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            onDoubleClick={() => {
              if (current.kind !== 'tab') return;
              setOpen(false);
              setDraft(current.title);
              setRenaming(true);
            }}
            title={current.kind === 'tab' ? `${current.title} — double-click to rename` : 'Switch note'}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="st-focus flex h-8 min-w-0 max-w-full items-center gap-1 rounded-md px-2 hover:bg-hover"
          >
            <span className="truncate text-base">{current.title}</span>
            <ChevronDown size={14} className="text-muted" />
          </button>
        )}
      </div>

      <IconButton label="Next note" onClick={() => step.current(1)} disabled={!canCycle}>
        <ChevronRight size={18} />
      </IconButton>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          data-popover
          className="st-scroll absolute left-2 right-2 top-[42px] z-20 max-h-[260px] overflow-y-auto rounded-xl border border-line bg-elevated p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        >
          {notes.map((n) => (
            <button
              key={n.id}
              type="button"
              role="option"
              aria-selected={n.id === current.id}
              onClick={() => {
                setOpen(false);
                onSelect(n.id);
              }}
              className="flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{n.title}</div>
                {n.kind === 'tab' && (
                  <div className="truncate text-xs text-muted">
                    {n.tabId === currentTabId ? 'This tab · ' : ''}
                    {displayHost(n.url)}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted">{n.tasks.filter((t) => !t.done).length || ''}</span>
              <Check size={14} className={cx('text-fg', n.id !== current.id && 'invisible')} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
