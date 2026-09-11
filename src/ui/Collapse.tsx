import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Reusable collapsible section. One consistent dropdown treatment for
 * every game: a full-width button row (chevron + title + optional right
 * badge) that expands a panel body. State is user-controlled once mounted.
 */
export function Collapse({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel cut">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-white/5 active:bg-white/10"
      >
        <ChevronDown
          size={18}
          className={`shrink-0 text-white/60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        <span className="text-sm font-bold tracking-wide">{title}</span>
        {badge != null && <span className="ml-auto text-xs">{badge}</span>}
      </button>
      {open && <div className="px-1 pt-2">{children}</div>}
    </div>
  );
}
