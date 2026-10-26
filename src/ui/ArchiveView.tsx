import { RotateCcw, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Note } from '../shared/types';
import { displayHost } from '../shared/url';
import { IconButton, SubHeader } from './primitives';

interface Props {
  notes: Note[];
  onBack: () => void;
  onRestore: (noteId: string) => Promise<void>;
  onDelete: (noteId: string) => void;
}

const formatDate = (ts: number | null) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export function ArchiveView({ notes, onBack, onRestore, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.url.toLowerCase().includes(q) ||
        n.tasks.some((t) => t.text.toLowerCase().includes(q)),
    );
  }, [notes, query]);

  const restore = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await onRestore(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore note');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <SubHeader title="Archived notes" onBack={onBack} />
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <Search size={15} className="text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (query ? setQuery('') : onBack())}
          placeholder="Search archived notes"
          aria-label="Search archived notes"
          className="h-8 min-w-0 flex-1 text-sm"
        />
      </div>
      {error && <div className="px-4 pt-2 text-xs text-muted">{error}</div>}
      <div className="st-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted">{query ? 'No matches' : 'No archived notes'}</div>
        ) : (
          filtered.map((n) => (
            <div key={n.id} className="group flex h-12 items-center gap-2 rounded-lg px-2 hover:bg-hover">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{n.title}</div>
                <div className="truncate text-xs text-muted">
                  {[displayHost(n.url), `${n.tasks.length} task${n.tasks.length === 1 ? '' : 's'}`, formatDate(n.archivedAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {confirmId === n.id ? (
                <button
                  type="button"
                  onClick={() => onDelete(n.id)}
                  className="st-focus h-7 rounded-md px-2 text-xs text-fg hover:bg-[#3A3A3C]"
                >
                  Delete
                </button>
              ) : (
                <>
                  <IconButton label="Restore in a new tab" onClick={() => restore(n.id)} disabled={busyId !== null}>
                    <RotateCcw size={15} />
                  </IconButton>
                  <IconButton label="Delete permanently" onClick={() => setConfirmId(n.id)}>
                    <Trash2 size={15} />
                  </IconButton>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
