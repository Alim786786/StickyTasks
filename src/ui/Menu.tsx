import { Archive, ArrowLeftRight, FilePlus2, FileText, List, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { Toggle } from './primitives';

interface Props {
  hasTabNote: boolean;
  viewingTabNote: boolean;
  archivedCount: number;
  switchTabs: boolean;
  onTabNote: () => void;
  onGlobal: () => void;
  onArchive: () => void;
  onSwitchTabs: (v: boolean) => void;
  onSettings: () => void;
}

function Item({ icon, label, onClick, trailing }: { icon: ReactNode; label: string; onClick?: () => void; trailing?: ReactNode }) {
  return (
    // A div rather than a button so a trailing toggle can nest inside it.
    <div
      role="menuitem"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="st-focus flex h-9 w-full cursor-default select-none items-center gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-hover"
    >
      <span className="text-[#C7C7CC]">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </div>
  );
}

const Divider = () => <div className="mx-2 my-1 h-px bg-line" />;

export function Menu(p: Props) {
  return (
    <div
      role="menu"
      data-popover
      className="absolute right-3 top-[48px] z-30 w-[232px] rounded-xl border border-line bg-elevated p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
    >
      <Item
        icon={p.hasTabNote ? <FileText size={16} /> : <FilePlus2 size={16} />}
        label={p.hasTabNote ? (p.viewingTabNote ? 'Tab note' : 'View tab note') : 'Create tab note'}
        onClick={p.onTabNote}
      />
      <Item icon={<List size={16} />} label="Global list" onClick={p.onGlobal} />
      <Item
        icon={<Archive size={16} />}
        label="Archived notes"
        onClick={p.onArchive}
        trailing={p.archivedCount > 0 && <span className="text-xs text-muted">{p.archivedCount}</span>}
      />
      <Divider />
      <Item
        icon={<ArrowLeftRight size={16} />}
        label="Switch Chrome tabs"
        onClick={() => p.onSwitchTabs(!p.switchTabs)}
        trailing={<Toggle checked={p.switchTabs} onChange={p.onSwitchTabs} label="Switch Chrome tabs" />}
      />
      <Divider />
      <Item icon={<Settings size={16} />} label="Settings" onClick={p.onSettings} />
    </div>
  );
}
