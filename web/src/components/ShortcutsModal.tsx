import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { fmtMod, fmtShift } from '../lib/platform';

interface ShortcutsModalProps {
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ onClose }) => {
  const groups = [
    {
      title: 'Navigation & selection',
      items: [
        ['Select component / layer', 'Click'],
        ['Deep-select nested layer', `${fmtMod('Click')} / Dbl-click`],
        ['Measure from selection', 'Hover / Alt'],
        ['Quick copy context menu', 'Right-click'],
        ['Select parent / child', 'Esc / Enter'],
        ['Cycle sibling layers', `Tab / ${fmtShift('Tab')}`],
        ['Inspect / Hand tool', 'V / H'],
        ['Measure / Annotate tool', `${fmtShift('M')} / ${fmtShift('T')}`],
        ['Pan canvas', 'Space + Drag']
      ]
    },
    {
      title: 'Zoom & overlays',
      items: [
        ['Zoom in / out', '+ / -'],
        ['Zoom to fit', '0'],
        ['Zoom to 100%', '1'],
        ['Zoom to selection', fmtShift('2')],
        ['Toggle pixel rulers', fmtShift('R')],
        ['Toggle layer outlines', fmtShift('O')],
        ['Toggle canvas annotations', 'A']
      ]
    },
    {
      title: 'Workspace',
      items: [
        ['Quick search', fmtMod('K')],
        ['Hide / show UI panels', fmtMod('\\')],
        ['Paste from Figma', fmtMod('V')],
        ['Keyboard shortcuts', '?']
      ]
    }
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fig-modal shortcuts-card"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={e => e.stopPropagation()}
      >
        <div className="fig-modal-head">
          <h2>Keyboard shortcuts</h2>
          <button className="fig-modal-close" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="shortcuts-grid">
          {groups.map(g => (
            <div key={g.title} className="shortcut-col">
              <div className="shortcut-group-title">{g.title}</div>
              {g.items.map(([desc, keys]) => (
                <div key={desc} className="shortcut-row">
                  <span className="shortcut-desc">{desc}</span>
                  <kbd className="shortcut-key">{keys}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
