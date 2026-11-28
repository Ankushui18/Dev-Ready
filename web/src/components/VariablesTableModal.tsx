import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  Hash,
  Palette,
  Search,
  Sparkles,
  Square,
  Table2,
  Type,
  X
} from 'lucide-react';
import type { CodeTarget, DevReadyBundle, InspectLayer, TokenEntry } from '../types';
import { formatVariableSyntax } from '../lib/codegen';

interface VariablesTableModalProps {
  bundle: DevReadyBundle;
  activeMode?: string;
  initialTarget: CodeTarget;
  initialTokenName?: string;
  onModeChange: (mode: string) => void;
  onSelectLayer?: (layerId: string) => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

type CategoryFilter = 'all' | TokenEntry['category'];

const SYNTAX_TARGETS: { value: CodeTarget; label: string }[] = [
  { value: 'css', label: 'CSS' },
  { value: 'tailwind', label: 'Tailwind' },
  { value: 'swiftui', label: 'SwiftUI' },
  { value: 'compose', label: 'Compose' },
  { value: 'flutter', label: 'Flutter' }
];

function CategoryIcon({ category }: { category: TokenEntry['category'] }) {
  if (category === 'color') return <Palette size={12} />;
  if (category === 'typography') return <Type size={12} />;
  if (category === 'shadow') return <Sparkles size={12} />;
  if (category === 'radius') return <Square size={12} />;
  return <Hash size={12} />;
}

export const VariablesTableModal: React.FC<VariablesTableModalProps> = ({
  bundle,
  activeMode,
  initialTarget,
  initialTokenName,
  onModeChange,
  onSelectLayer,
  onClose,
  onNotify
}) => {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [syntaxTarget, setSyntaxTarget] = useState<CodeTarget>(
    SYNTAX_TARGETS.some(t => t.value === initialTarget) ? initialTarget : 'css'
  );
  const [selectedName, setSelectedName] = useState<string>(
    initialTokenName || bundle.tokens[0]?.name || ''
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const modes = useMemo<string[]>(() => {
    if (bundle.tokenModes && bundle.tokenModes.length > 0) return bundle.tokenModes;
    const found = new Set<string>();
    for (const t of bundle.tokens) {
      if (t.modes) Object.keys(t.modes).forEach(k => found.add(k));
    }
    return found.size > 0 ? Array.from(found) : ['Value'];
  }, [bundle.tokenModes, bundle.tokens]);

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: bundle.tokens.length,
      color: 0,
      spacing: 0,
      radius: 0,
      typography: 0,
      shadow: 0
    };
    for (const t of bundle.tokens) counts[t.category] = (counts[t.category] || 0) + 1;
    return counts;
  }, [bundle.tokens]);

  const filteredTokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bundle.tokens.filter(t => {
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      const modeVals = t.modes ? Object.values(t.modes).join(' ').toLowerCase() : '';
      return (
        t.name.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        modeVals.includes(q)
      );
    });
  }, [bundle.tokens, category, query]);

  const selectedToken = useMemo(
    () => bundle.tokens.find(t => t.name === selectedName) || filteredTokens[0] || null,
    [bundle.tokens, selectedName, filteredTokens]
  );

  // Map each token to the layers using it (by bound token ref OR exact matching color/spacing/radius value)
  const usageMap = useMemo(() => {
    const map = new Map<string, InspectLayer[]>();
    const allLayers: InspectLayer[] = [];
    const walk = (n: InspectLayer) => {
      allLayers.push(n);
      if (n.children) n.children.forEach(walk);
    };
    walk(bundle.root);

    for (const tok of bundle.tokens) {
      const cleanName = tok.name.replace(/^--/, '').toLowerCase();
      const valSet = new Set<string>([tok.value.trim().toLowerCase()]);
      if (tok.modes) {
        Object.values(tok.modes).forEach(v => valSet.add(v.trim().toLowerCase()));
      }
      const numVal = parseFloat(tok.value);
      const hits: InspectLayer[] = [];
      for (const l of allLayers) {
        let matched = false;
        if (l.fills?.some(f => (f.token && f.token.replace(/^--/, '').toLowerCase() === cleanName) || (f.color && valSet.has(f.color.toLowerCase())))) {
          matched = true;
        } else if (l.strokes?.some(s => (s.token && s.token.replace(/^--/, '').toLowerCase() === cleanName) || valSet.has(s.color.toLowerCase()))) {
          matched = true;
        } else if (tok.category === 'radius' && typeof l.radius === 'number' && !Number.isNaN(numVal) && Math.round(l.radius) === Math.round(numVal)) {
          matched = true;
        } else if (tok.category === 'spacing' && l.autoLayout && !Number.isNaN(numVal) && (Math.round(l.autoLayout.gap) === Math.round(numVal) || Math.round(l.autoLayout.paddingLeft) === Math.round(numVal))) {
          matched = true;
        }
        if (matched) hits.push(l);
      }
      map.set(tok.name, hits);
    }
    return map;
  }, [bundle.root, bundle.tokens]);

  const copyCell = async (text: string, key: string, label: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    onNotify(`Copied ${label}`);
    window.setTimeout(() => setCopiedKey(null), 1200);
  };

  const categories: { id: CategoryFilter; label: string }[] = [
    { id: 'all', label: 'All variables' },
    { id: 'color', label: 'Color' },
    { id: 'spacing', label: 'Spacing' },
    { id: 'radius', label: 'Radius' },
    { id: 'shadow', label: 'Shadow' },
    { id: 'typography', label: 'Typography' }
  ];

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fig-modal fig-modal-vars"
        role="dialog"
        aria-modal="true"
        aria-label="Variables table"
        onClick={e => e.stopPropagation()}
      >
        <div className="vars-shell">
          {/* Left Collection Sidebar (exact Figma UI3 Variables modal) */}
          <aside className="vars-sidebar">
            <div className="vars-collection-head">
              <Table2 size={13} />
              <span>Local tokens</span>
            </div>
            <div className="vars-cat-list">
              {categories
                .filter(c => c.id === 'all' || categoryCounts[c.id] > 0)
                .map(c => (
                  <button
                    key={c.id}
                    className={`vars-cat-item ${category === c.id ? 'active' : ''}`}
                    onClick={() => setCategory(c.id)}
                  >
                    <span>{c.label}</span>
                    <span className="vars-cat-count mono">{categoryCounts[c.id]}</span>
                  </button>
                ))}
            </div>
          </aside>

          {/* Right Table Pane */}
          <div className="vars-main">
            {/* Top Bar */}
            <div className="vars-topbar">
              <div className="vars-search-box">
                <Search size={12} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search variables or values…"
                  autoFocus
                />
                {query && (
                  <button className="vars-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
                    <X size={11} />
                  </button>
                )}
              </div>

              <div className="vars-top-right">
                <div className="seg-inline">
                  {SYNTAX_TARGETS.map(st => (
                    <button
                      key={st.value}
                      className={syntaxTarget === st.value ? 'active' : ''}
                      onClick={() => setSyntaxTarget(st.value)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <button className="fig-modal-close" onClick={onClose} aria-label="Close">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Spreadsheet Table */}
            <div className="vars-table-scroll">
              <table className="vars-table">
                <thead>
                  <tr>
                    <th className="col-name">Name</th>
                    {modes.map(m => (
                      <th key={m} className="col-mode">
                        <div className="vars-mode-th">
                          <span>{m === 'Value' ? 'Value' : `${m} mode`}</span>
                          {bundle.tokenModes?.includes(m) && (
                            <button
                              className={`vars-mode-pill ${activeMode === m ? 'active' : ''}`}
                              onClick={() => onModeChange(m)}
                              title={`Preview canvas in ${m} mode`}
                            >
                              {activeMode === m ? 'Active' : 'Preview'}
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="col-syntax">Code syntax</th>
                    <th className="col-usage">Used in</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTokens.length === 0 ? (
                    <tr>
                      <td colSpan={modes.length + 3} className="vars-empty-cell">
                        No variables match “{query}”.
                      </td>
                    </tr>
                  ) : (
                    filteredTokens.map(t => {
                      const syntax = formatVariableSyntax(
                        t.name,
                        syntaxTarget,
                        t.category === 'color' ? 'bg' : 'raw'
                      );
                      const isSelected = selectedToken?.name === t.name;
                      const usedLayers = usageMap.get(t.name) || [];
                      return (
                        <tr
                          key={t.name}
                          className={isSelected ? 'selected' : ''}
                          onClick={() => setSelectedName(t.name)}
                        >
                          <td className="col-name">
                            <div className="vars-name-cell">
                              <span className="vars-type-ic">
                                <CategoryIcon category={t.category} />
                              </span>
                              <span className="vars-name-text">{t.name}</span>
                            </div>
                          </td>
                          {modes.map(m => {
                            const val = m === 'Value' ? t.value : t.modes?.[m] || t.value;
                            const key = `${t.name}-${m}`;
                            return (
                              <td key={m} className="col-mode">
                                <button
                                  className="vars-val-btn"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setSelectedName(t.name);
                                    copyCell(val, key, `${t.name} (${m}): ${val}`);
                                  }}
                                  title={`Click to copy ${val}`}
                                >
                                  {t.category === 'color' && (
                                    <span className="swatch-sq" style={{ background: val }} />
                                  )}
                                  <span className="mono">{val}</span>
                                  <span className="vars-cell-copy">
                                    {copiedKey === key ? <Check size={11} /> : <Copy size={11} />}
                                  </span>
                                </button>
                              </td>
                            );
                          })}
                          <td className="col-syntax">
                            <button
                              className="vars-syntax-btn mono"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedName(t.name);
                                copyCell(syntax, `syn-${t.name}`, syntax);
                              }}
                              title={`Copy ${syntax}`}
                            >
                              <span>{syntax}</span>
                              <span className="vars-cell-copy">
                                {copiedKey === `syn-${t.name}` ? <Check size={11} /> : <Copy size={11} />}
                              </span>
                            </button>
                          </td>
                          <td className="col-usage">
                            {usedLayers.length > 0 && onSelectLayer ? (
                              <button
                                className="vars-usage-pill mono"
                                onClick={e => {
                                  e.stopPropagation();
                                  onSelectLayer(usedLayers[0].id);
                                  onNotify(`Selected "${usedLayers[0].name}"`);
                                }}
                                title={`Jump to "${usedLayers[0].name}" on canvas`}
                              >
                                {usedLayers.length} {usedLayers.length === 1 ? 'layer' : 'layers'}
                              </button>
                            ) : (
                              <span className="vars-usage-zero mono">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Variable Details Strip (Figma Variable details summary) */}
            {selectedToken && (() => {
              const selHits = usageMap.get(selectedToken.name) || [];
              return (
                <div className="vars-detail-bar">
                  <div className="vars-detail-left">
                    <span className="vars-detail-badge">{selectedToken.category}</span>
                    <strong className="vars-detail-name">{selectedToken.name}</strong>
                    {selHits.length > 0 && onSelectLayer ? (
                      <div className="vars-detail-jumps">
                        {selHits.slice(0, 3).map(l => (
                          <button
                            key={l.id}
                            className="vars-jump-chip"
                            onClick={() => {
                              onSelectLayer(l.id);
                              onNotify(`Jumped to "${l.name}"`);
                            }}
                            title={`Select "${l.name}" on canvas`}
                          >
                            {l.name}
                          </button>
                        ))}
                        {selHits.length > 3 && (
                          <span className="vars-detail-scope mono">+{selHits.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="vars-detail-scope">
                        {bundle.fileName || bundle.name} · Local tokens
                      </span>
                    )}
                  </div>
                  <button
                    className="fig-btn-primary vars-copy-syntax"
                    onClick={() => {
                      const syn = formatVariableSyntax(
                        selectedToken.name,
                        syntaxTarget,
                        selectedToken.category === 'color' ? 'bg' : 'raw'
                      );
                      copyCell(syn, `detail-${selectedToken.name}`, syn);
                    }}
                  >
                    {copiedKey === `detail-${selectedToken.name}` ? (
                      <>
                        <Check size={12} />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy {SYNTAX_TARGETS.find(x => x.value === syntaxTarget)?.label} syntax</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
