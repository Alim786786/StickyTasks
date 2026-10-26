import { ChevronLeft } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'st-focus flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cx(
        'st-focus relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150',
        checked ? 'bg-[#E5E5EA]' : 'bg-[#3A3A3C]',
      )}
    >
      <span
        className={cx(
          'absolute top-[2px] h-[18px] w-[18px] rounded-full shadow-sm transition-[left] duration-150',
          checked ? 'left-[18px] bg-[#111113]' : 'left-[2px] bg-[#E5E5EA]',
        )}
      />
    </button>
  );
}

/** Closes a popover on outside pointerdown, Escape, or focus leaving the panel. */
export function useDismiss(open: boolean, refs: RefObject<HTMLElement>[], close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const path = e.composedPath();
      if (!refs.some((r) => r.current && path.includes(r.current))) close();
    };
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    // Clicking the page outside the panel iframe blurs the frame's window.
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
    };
  }, [open, refs, close]);
}

export function SubHeader({ title, onBack, children }: { title: string; onBack: () => void; children?: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
      <IconButton label="Back" onClick={onBack}>
        <ChevronLeft size={18} />
      </IconButton>
      <span className="flex-1 truncate text-sm font-medium">{title}</span>
      {children}
    </div>
  );
}
