import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

export function AddTask({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div
      className="flex h-11 shrink-0 cursor-text items-center gap-3 border-t border-line px-4"
      onClick={() => ref.current?.focus()}
    >
      <Plus size={18} className="text-muted" />
      <input
        ref={ref}
        value={text}
        maxLength={1000}
        placeholder="Add a task..."
        aria-label="Add a task"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (text.trim()) onAdd(text);
            setText('');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setText('');
            ref.current?.blur();
          }
        }}
        className="h-8 min-w-0 flex-1 text-base"
      />
    </div>
  );
}
