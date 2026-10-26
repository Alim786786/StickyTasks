import type { ReactNode } from 'react';
import { SubHeader, Toggle } from './primitives';

interface Props {
  switchTabs: boolean;
  noteTitle: string;
  completedCount: number;
  onBack: () => void;
  onSwitchTabs: (v: boolean) => void;
  onClearCompleted: () => void;
  onResetPosition: () => void;
}

function Row({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{title}</div>
        {detail && <div className="mt-0.5 text-xs text-muted">{detail}</div>}
      </div>
      {children}
    </div>
  );
}

const actionClass = 'st-focus h-7 shrink-0 rounded-md bg-hover px-2.5 text-xs hover:bg-[#2E2E32] disabled:opacity-40';

export function SettingsView(p: Props) {
  return (
    <>
      <SubHeader title="Settings" onBack={p.onBack} />
      <div className="st-scroll min-h-0 flex-1 overflow-y-auto p-2">
        <Row title="Switch Chrome tabs" detail="Selecting a tab note jumps to its browser tab.">
          <Toggle checked={p.switchTabs} onChange={p.onSwitchTabs} label="Switch Chrome tabs" />
        </Row>
        <Row title="Clear completed" detail={`Remove checked tasks from “${p.noteTitle}”.`}>
          <button type="button" className={actionClass} onClick={p.onClearCompleted} disabled={p.completedCount === 0}>
            Clear{p.completedCount ? ` ${p.completedCount}` : ''}
          </button>
        </Row>
        <Row title="Panel position" detail="Move the panel back to the top-right corner.">
          <button type="button" className={actionClass} onClick={p.onResetPosition}>
            Reset
          </button>
        </Row>
        <div className="mx-2 my-2 h-px bg-line" />
        <p className="px-2 py-1 text-xs text-muted">
          Tasks are saved automatically in this browser’s local storage and are never sent anywhere. Closing a tab
          archives its note; reloading or hiding the panel does not.
        </p>
      </div>
    </>
  );
}
