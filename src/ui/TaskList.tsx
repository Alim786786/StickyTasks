import { useState, type DragEvent } from 'react';
import type { Op } from '../shared/model';
import type { Note } from '../shared/types';
import { TaskRow } from './TaskRow';

interface Props {
  note: Note;
  dispatch: (op: Op) => void;
}

export function TaskList({ note, dispatch }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ index: number; pos: 'above' | 'below' } | null>(null);
  const tasks = note.tasks;

  if (tasks.length === 0) {
    return <div className="px-2 py-3 text-sm text-muted">No tasks yet</div>;
  }

  const move = (taskId: string, toIndex: number) => dispatch({ t: 'task.move', noteId: note.id, taskId, toIndex });

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragId && drop) {
      const from = tasks.findIndex((t) => t.id === dragId);
      let to = drop.pos === 'above' ? drop.index : drop.index + 1;
      if (from < to) to -= 1;
      if (from >= 0 && from !== to) move(dragId, to);
    }
    setDragId(null);
    setDrop(null);
  };

  return (
    <div role="list" onDragLeave={(e) => e.currentTarget === e.target && setDrop(null)}>
      {tasks.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          dropIndicator={dragId && drop?.index === index ? drop.pos : null}
          onToggle={() => dispatch({ t: 'task.update', noteId: note.id, taskId: task.id, done: !task.done })}
          onRename={(text) => dispatch({ t: 'task.update', noteId: note.id, taskId: task.id, text })}
          onDelete={() => dispatch({ t: 'task.delete', noteId: note.id, taskId: task.id })}
          onMove={(delta) => move(task.id, index + delta)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', task.text);
            setDragId(task.id);
          }}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const box = e.currentTarget.getBoundingClientRect();
            const pos = e.clientY < box.top + box.height / 2 ? 'above' : 'below';
            if (drop?.index !== index || drop.pos !== pos) setDrop({ index, pos });
          }}
          onDrop={handleDrop}
          onDragEnd={() => {
            setDragId(null);
            setDrop(null);
          }}
        />
      ))}
    </div>
  );
}
