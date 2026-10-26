import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyOp, type Op } from '../shared/model';
import type { AppState } from '../shared/types';
import { onStateChange, readState, request } from '../panel/bridge';

interface PendingOp {
  op: Op;
  /** Revision that includes this op, known once the service worker acks it. */
  rev: number | null;
}

/**
 * Saved state plus optimistic local ops. An op stays applied locally until the
 * canonical state from storage reaches the revision that contains it, so the
 * UI never flickers back to stale data while writes are in flight.
 */
export function useAppState(onError: (err: unknown) => void) {
  const [canonical, setCanonical] = useState<AppState | null>(null);
  const [pendingVersion, setPendingVersion] = useState(0);
  const pending = useRef<PendingOp[]>([]);
  const canonicalRev = useRef(-1);

  const prune = useCallback(() => {
    const before = pending.current.length;
    pending.current = pending.current.filter((p) => p.rev === null || p.rev > canonicalRev.current);
    if (pending.current.length !== before) setPendingVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const accept = (s: AppState) => {
      if (s.rev < canonicalRev.current) return;
      canonicalRev.current = s.rev;
      setCanonical(s);
      prune();
    };
    const off = onStateChange(accept);
    readState().then(accept, onError);
    return off;
  }, [onError, prune]);

  const dispatch = useCallback(
    (op: Op) => {
      const entry: PendingOp = { op, rev: null };
      pending.current = [...pending.current, entry];
      setPendingVersion((v) => v + 1);
      request({ type: 'op', op }).then(
        ({ rev }) => {
          entry.rev = rev;
          prune();
        },
        (err) => {
          pending.current = pending.current.filter((p) => p !== entry);
          setPendingVersion((v) => v + 1);
          onError(err);
        },
      );
    },
    [onError, prune],
  );

  const state = useMemo(() => {
    if (!canonical) return null;
    const now = Date.now();
    return pending.current.reduce((s, p) => applyOp(s, p.op, now), canonical);
  }, [canonical, pendingVersion]);

  return { state, dispatch };
}
