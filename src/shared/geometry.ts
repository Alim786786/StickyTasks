import type { PanelRect } from './types';

export const DEFAULT_WIDTH = 340;
export const MAX_AUTO_HEIGHT = 520;
export const MIN_WIDTH = 260;
export const MAX_WIDTH = 720;
export const MIN_HEIGHT = 180;
const MARGIN = 16;
const MIN_VISIBLE = 48;

export function defaultRect(vw: number): PanelRect {
  return { x: Math.max(MARGIN, vw - DEFAULT_WIDTH - MARGIN), y: MARGIN, width: DEFAULT_WIDTH, height: null };
}

/** Keeps the panel reachable when the viewport shrinks. */
export function clampRect(r: PanelRect, vw: number, vh: number): PanelRect {
  const width = Math.min(Math.max(r.width, MIN_WIDTH), Math.max(MIN_WIDTH, vw - 8), MAX_WIDTH);
  return {
    width,
    height: r.height === null ? null : Math.min(Math.max(r.height, MIN_HEIGHT), Math.max(MIN_HEIGHT, vh - 8)),
    x: Math.min(Math.max(r.x, MIN_VISIBLE - width), vw - MIN_VISIBLE),
    y: Math.min(Math.max(r.y, 0), vh - MIN_VISIBLE),
  };
}

export function maxAutoHeight(r: PanelRect, vh: number): number {
  return Math.max(200, Math.min(MAX_AUTO_HEIGHT, vh - r.y - 8));
}

export function dragRect(start: PanelRect, mode: 'move' | 'resize', dx: number, dy: number): PanelRect {
  if (mode === 'move') return { ...start, x: start.x + dx, y: start.y + dy };
  return {
    ...start,
    width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, start.width + dx)),
    height: Math.max(MIN_HEIGHT, (start.height ?? MIN_HEIGHT) + dy),
  };
}
