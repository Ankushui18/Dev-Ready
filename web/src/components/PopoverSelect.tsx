import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  sub?: string;
  group?: string;
  dotColor?: string;
}

interface PopoverSelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  align?: 'left' | 'right';
  compact?: boolean;
  ariaLabel?: string;
}

export function PopoverSelect<T extends string>({
  value,
  options,
  onChange,
  className = '',
  align = 'left',
  compact = false,
  ariaLabel
}: PopoverSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number; maxHeight: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const minW = Math.max(180, Math.round(rect.width));
    const menuEstH = Math.min(280, options.length * 32 + 24);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    let top = rect.bottom + 5;
    let maxHeight = Math.min(280, Math.max(120, spaceBelow));
    if (spaceBelow < menuEstH && spaceAbove > spaceBelow) {
      maxHeight = Math.min(280, Math.max(120, spaceAbove));
      top = Math.max(12, rect.top - Math.min(menuEstH, maxHeight) - 5);
    }

    let left = align === 'right' ? rect.right - minW : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - minW - 8));

    setCoords({ top, left, minWidth: minW, maxHeight });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, align, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onViewportChange = (e: Event) => {
      if (e.type === 'scroll' && menuRef.current?.contains(e.target as Node)) return;
      updatePosition();
    };
    window.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  const current = options.find(o => o.value === value) || options[0];

  // Group options preserving order
  const groups: Array<{ name: string | null; items: SelectOption<T>[] }> = [];
  for (const opt of options) {
    const g = opt.group || null;
    let bucket = groups.find(b => b.name === g);
    if (!bucket) {
      bucket = { name: g, items: [] };
      groups.push(bucket);
    }
    bucket.items.push(opt);
  }

  return (
    <div className={`pop-select ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`pop-trigger ${compact ? 'compact' : ''} ${open ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        {current?.dotColor && (
          <span className="pop-dot" style={{ background: current.dotColor }} />
        )}
        <span className="pop-label">{current?.label}</span>
        <ChevronDown size={12} className="pop-chev" />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            className="pop-menu pop-menu-portal"
            role="listbox"
            style={{
              top: coords.top,
              left: coords.left,
              minWidth: coords.minWidth,
              maxHeight: coords.maxHeight
            }}
          >
            {groups.map((grp, gi) => (
              <div key={grp.name || gi} className="pop-group">
                {grp.name && <div className="pop-group-label">{grp.name}</div>}
                {grp.items.map(opt => {
                  const active = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`pop-item ${active ? 'active' : ''}`}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                    >
                      <span className="pop-check">{active ? <Check size={11} /> : null}</span>
                      {opt.dotColor && (
                        <span className="pop-dot" style={{ background: opt.dotColor }} />
                      )}
                      <span className="pop-item-text">
                        <span>{opt.label}</span>
                        {opt.sub && <span className="pop-item-sub">{opt.sub}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
