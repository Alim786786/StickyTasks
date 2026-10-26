import { describe, expect, it } from 'vitest';
import { Store, type KeyValueArea } from '../src/background/store';
import { applyOp } from '../src/shared/model';
import { STATE_KEY } from '../src/shared/messages';
import { GLOBAL_NOTE_ID } from '../src/shared/types';

/** In-memory chrome.storage.local stand-in with async, randomly delayed I/O. */
class FakeArea implements KeyValueArea {
  data: Record<string, unknown> = {};
  writes = 0;
  private tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));
  async get(key: string) {
    await this.tick();
    return key in this.data ? { [key]: structuredClone(this.data[key]) } : {};
  }
  async set(items: Record<string, unknown>) {
    await this.tick();
    this.writes++;
    Object.assign(this.data, structuredClone(items));
  }
}

describe('Store', () => {
  it('persists state and bumps the revision on each change', async () => {
    const area = new FakeArea();
    const store = new Store(area, () => 1);
    const s = await store.update((st, now) =>
      applyOp(st, { t: 'task.add', noteId: GLOBAL_NOTE_ID, taskId: 't1', text: 'hello' }, now),
    );
    expect(s.rev).toBe(1);
    const reloaded = await new Store(area).read();
    expect(reloaded.notes.global.tasks[0].text).toBe('hello');
  });

  it('skips writes when nothing changed', async () => {
    const area = new FakeArea();
    const store = new Store(area);
    await store.update((s) => s);
    expect(area.writes).toBe(0);
  });

  it('serializes concurrent writes so none are lost', async () => {
    const area = new FakeArea();
    const store = new Store(area);
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        store.update((st, now) =>
          applyOp(st, { t: 'task.add', noteId: GLOBAL_NOTE_ID, taskId: `t${i}`, text: `task ${i}` }, now),
        ),
      ),
    );
    const s = await store.read();
    expect(s.notes.global.tasks).toHaveLength(25);
    expect(s.rev).toBe(25);
  });

  it('keeps working after a failed transaction', async () => {
    const store = new Store(new FakeArea());
    await expect(
      store.update(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const s = await store.update((st, now) =>
      applyOp(st, { t: 'task.add', noteId: GLOBAL_NOTE_ID, taskId: 'x', text: 'after' }, now),
    );
    expect(s.notes.global.tasks).toHaveLength(1);
  });

  it('loads corrupted storage without crashing', async () => {
    const area = new FakeArea();
    area.data[STATE_KEY] = 'garbage';
    const s = await new Store(area).read();
    expect(s.notes.global).toBeDefined();
  });
});
