import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { Task } from '../shared/types';
import { cx } from './primitives';

interface Props {
  task: Task;
  dropIndicator: 'above' | 'below' | null;
  onToggle: () => void;
  onRename: (text: string) => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: () => void;
}

export function TaskRow(p: Props) {
  const { task } = p;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(task.text);
    setEditing(true);
  };

  const commit = () => {
    if (!editing) return;
    setEditing(false);
    const text = draft.trim();
    if (!text) p.onDelete();
    else if (text !== task.text) p.onRename(text);
  };

  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(task.text);
      setEditing(false);
    }
  };

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing || !e.altKey) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      p.onMove(e.key === 'ArrowUp' ? -1 : 1);
    }
  };

  return (
    <div
      role="listitem"
      draggable={!editing}
      onDragStart={p.onDragStart}
      onDragOver={p.onDragOver}
      onDrop={p.onDrop}
      onDragEnd={p.onDragEnd}
      onKeyDown={onRowKey}
      className="group relative flex h-10 items-center gap-3 rounded-lg px-2 hover:bg-hover"
    >
      {p.dropIndicator && (
        <div
          className={cx(
            'pointer-events-none absolute left-2 right-2 h-px bg-[#8E8E93]',
            p.dropIndicator === 'above' ? 'top-0' : 'bottom-0',
          )}
        />
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
        onClick={p.onToggle}
        className={cx(
          'st-focus flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]',
          task.done ? 'border-[#D1D1D6] bg-[#D1D1D6]' : 'border-[#8E8E93] hover:border-[#C7C7CC]',
        )}
      >
        {task.done && <Check size={12} strokeWidth={3} className="text-[#111113]" />}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onEditKey}
          onBlur={commit}
          className="h-8 min-w-0 flex-1 text-base text-fg"
          aria-label="Edit task"
        />
      ) : (
        <span
          onClick={startEdit}
          title={task.text}
          className={cx(
            'min-w-0 flex-1 cursor-text truncate text-base',
            task.done ? 'text-muted line-through decoration-[#8E8E93]' : 'text-fg',
          )}
        >
          {task.text}
        </span>
      )}

      {!editing && (
        <button
          type="button"
          aria-label="Delete task"
          title="Delete"
          onClick={p.onDelete}
          className="st-focus flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
