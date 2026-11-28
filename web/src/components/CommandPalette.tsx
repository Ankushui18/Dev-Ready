import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Figma,
  FileJson,
  GitCompareArrows,
  Layers,
  LayoutGrid,
  Moon,
  Ruler,
  Search,
  Share2,
  Sparkles,
  Sun,
  Table2
} from 'lucide-react';
import type { DevReadyBundle } from '../types';
import { flattenLayers } from '../lib/measure';
import { fmtShift } from '../lib/platform';

interface CommandPaletteProps {
  screens: DevReadyBundle[];
  activeScreen: DevReadyBundle;
  theme: 'dark' | 'light';
  onClose: () => void;
  onSelectLayer: (id: string) => void;
  onSelectScreen: (id: string) => void;
  onToggleTheme: () => void;
  onToggleRulers: () => void;
  onOpenImport: () => void;
  onOpenShare: () => void;
  onOpenCompareChanges: () => void;
  onOpenVariablesTable: () => void;
  onOpenReadyFeed: () => void;
  onCopyAiPrompt: () => void;
  onCopyMcpJson: () => void;
}

interface PaletteItem {
  id: string;
  group: 'Actions' | 'Screens' | 'Layers';
  label: string;
  meta?: string;
  icon: React.ReactNode;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  screens,
  activeScreen,
  theme,
  onClose,
  onSelectLayer,
  onSelectScreen,
  onToggleTheme,
  onToggleRulers,
  onOpenImport,
  onOpenShare,
  onOpenCompareChanges,
  onOpenVariablesTable,
  onOpenReadyFeed,
  onCopyAiPrompt,
  onCopyMcpJson
}) => {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: 'act-ready-feed',
        group: 'Actions',
        label: 'Open Ready for dev feed',
        meta: `${screens.length} screens`,
        icon: <LayoutGrid size={14} />,
        run: onOpenReadyFeed
      },
      {
        id: 'act-compare',
        group: 'Actions',
        label: 'Compare changes (Version diff)',
        meta: 'Side-by-side · CSS diff',
        icon: <GitCompareArrows size={14} />,
        run: onOpenCompareChanges
      },
      {
        id: 'act-vars-table',
        group: 'Actions',
        label: 'Open variables table (Light / Dark modes)',
        meta: 'Tokens',
        icon: <Table2 size={14} />,
        run: onOpenVariablesTable
      },
      {
        id: 'act-ai-prompt',
        group: 'Actions',
        label: 'Copy AI design prompt (Cursor / Claude / Codex)',
        meta: 'Markdown',
        icon: <Sparkles size={14} />,
        run: onCopyAiPrompt
      },
      {
        id: 'act-mcp-json',
        group: 'Actions',
        label: 'Copy MCP design context JSON',
        meta: 'MCP v1',
        icon: <FileJson size={14} />,
        run: onCopyMcpJson
      },
      {
        id: 'act-import',
        group: 'Actions',
        label: 'Import frame from Figma',
        meta: 'Bridge / Paste / JSON',
        icon: <Figma size={14} />,
        run: onOpenImport
      },
      {
        id: 'act-share',
        group: 'Actions',
        label: 'Share encrypted web link or export HTML',
        meta: 'AES-256 E2E',
        icon: <Share2 size={14} />,
        run: onOpenShare
      },
      {
        id: 'act-rulers',
        group: 'Actions',
        label: 'Toggle pixel rulers',
        meta: fmtShift('R'),
        icon: <Ruler size={14} />,
        run: onToggleRulers
      },
      {
        id: 'act-theme',
        group: 'Actions',
        label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} interface`,
        meta: 'Theme',
        icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />,
        run: onToggleTheme
      }
    ];

    const screenItems: PaletteItem[] = screens.map(s => ({
      id: `scr-${s.id}`,
      group: 'Screens',
      label: s.name,
      meta: `${Math.round(s.width)}×${Math.round(s.height)}`,
      icon: <LayoutGrid size={14} />,
      run: () => onSelectScreen(s.id)
    }));

    const layerItems: PaletteItem[] = flattenLayers(activeScreen.root)
      .slice(0, 60)
      .map(l => ({
        id: `lay-${l.id}`,
        group: 'Layers',
        label: l.name,
        meta: `${l.type} · ${Math.round(l.width)}×${Math.round(l.height)}`,
        icon: <Layers size={14} />,
        run: () => onSelectLayer(l.id)
      }));

    return [...actions, ...screenItems, ...layerItems];
  }, [
    screens,
    activeScreen,
    theme,
    onOpenReadyFeed,
    onOpenCompareChanges,
    onOpenVariablesTable,
    onOpenImport,
    onOpenShare,
    onToggleRulers,
    onToggleTheme,
    onSelectScreen,
    onSelectLayer,
    onCopyAiPrompt,
    onCopyMcpJson
  ]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items.slice(0, 14);
    return items
      .filter(it => it.label.toLowerCase().includes(term) || (it.meta || '').toLowerCase().includes(term))
      .slice(0, 18);
  }, [items, q]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx(i => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx(i => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter' && filtered[idx]) {
      e.preventDefault();
      filtered[idx].run();
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cmdk-card" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cmdk-input-row">
          <Search size={15} className="cmdk-search-ic" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Jump to layer, switch screen, or run command…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <kbd className="cmdk-esc">ESC</kbd>
        </div>

        <div className="cmdk-list">
          {filtered.length === 0 ? (
            <div className="cmdk-empty">No matching layers or commands.</div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                className={`cmdk-item ${i === idx ? 'active' : ''}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                <span className="cmdk-ic">{item.icon}</span>
                <span className="cmdk-label">{item.label}</span>
                <span className="cmdk-group">{item.group}</span>
                {item.meta && <span className="cmdk-meta mono">{item.meta}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
