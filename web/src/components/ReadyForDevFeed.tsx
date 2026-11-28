import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  GitCompareArrows,
  Kanban,
  LayoutList,
  Link2,
  MessageSquare,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import type { AssetEntry, DevReadyBundle, InspectLayer, ScreenStatus } from '../types';
import { ArtboardVectorView } from './ArtboardVectorView';
import { PopoverSelect } from './PopoverSelect';
import { makeZip } from '../lib/codegen';

interface ReadyForDevFeedProps {
  screens: DevReadyBundle[];
  leftOffset: number;
  onInspectScreen: (id: string) => void;
  onStatusChange: (id: string, status: ScreenStatus) => void;
  onCompareScreen: (id: string) => void;
  onOpenImport: () => void;
  onClose: () => void;
}

type HubView = 'feed' | 'board' | 'styleguide';
type StatusFilter = 'all' | ScreenStatus;
type SortBy = 'recent' | 'name' | 'status';

interface StyleColorEntry {
  hex: string;
  tokenName?: string;
  screensCount: number;
}

interface StyleTypeEntry {
  key: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: number;
  sample: string;
  count: number;
}

interface StyleAssetEntry extends AssetEntry {
  screenName: string;
}

function fmtRelDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days <= 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function walkLayers(layer: InspectLayer, fn: (l: InspectLayer) => void) {
  fn(layer);
  if (layer.children) {
    for (const c of layer.children) walkLayers(c, fn);
  }
}

export const ReadyForDevFeed: React.FC<ReadyForDevFeedProps> = ({
  screens,
  leftOffset,
  onInspectScreen,
  onStatusChange,
  onCompareScreen,
  onOpenImport,
  onClose
}) => {
  const [hubView, setHubView] = useState<HubView>('feed');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragScreenId, setDragScreenId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ScreenStatus | null>(null);

  const copyQuick = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 1400);
  };

  const counts = useMemo(() => {
    let ready = 0;
    let inProgress = 0;
    let done = 0;
    for (const s of screens) {
      if (s.status === 'ready') ready++;
      else if (s.status === 'in-progress') inProgress++;
      else if (s.status === 'done') done++;
    }
    return { all: screens.length, ready, inProgress, done };
  }, [screens]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = screens.filter(sc => {
      if (hubView === 'feed' && filter !== 'all' && sc.status !== filter) return false;
      if (!q) return true;
      const latestNote = sc.history?.[0]?.summary || '';
      return (
        sc.name.toLowerCase().includes(q) ||
        (sc.fileName || '').toLowerCase().includes(q) ||
        (sc.pageName || '').toLowerCase().includes(q) ||
        (sc.notes || '').toLowerCase().includes(q) ||
        latestNote.toLowerCase().includes(q)
      );
    });

    const rank: Record<ScreenStatus, number> = { ready: 0, 'in-progress': 1, done: 2 };
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'status') return rank[a.status] - rank[b.status];
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [screens, hubView, filter, sortBy, query]);

  // Zeplin-style Project-Wide Auto Styleguide (Colors, Typography Scale, Spacing/Radius, All SVG Assets)
  const styleguide = useMemo(() => {
    const colorMap = new Map<string, { tokenName?: string; screenIds: Set<string> }>();
    const typeMap = new Map<string, StyleTypeEntry>();
    const spacingSet = new Set<number>();
    const radiusSet = new Set<number>();
    const assets: StyleAssetEntry[] = [];
    const seenAssetKey = new Set<string>();

    for (const sc of screens) {
      for (const tok of sc.tokens || []) {
        if (tok.category === 'color' && /^#[0-9a-f]{3,8}$/i.test(tok.value)) {
          const hex = tok.value.toUpperCase();
          const cur = colorMap.get(hex) || { tokenName: tok.name, screenIds: new Set<string>() };
          if (!cur.tokenName) cur.tokenName = tok.name;
          cur.screenIds.add(sc.id);
          colorMap.set(hex, cur);
        }
        if (tok.category === 'spacing') {
          const n = parseFloat(tok.value);
          if (!Number.isNaN(n) && n > 0) spacingSet.add(Math.round(n));
        }
        if (tok.category === 'radius') {
          const n = parseFloat(tok.value);
          if (!Number.isNaN(n) && n > 0) radiusSet.add(Math.round(n));
        }
      }

      walkLayers(sc.root, layer => {
        if (layer.fills) {
          for (const f of layer.fills) {
            if (f.type === 'SOLID' && f.color) {
              const hex = f.color.toUpperCase();
              const cleanTok = f.token ? f.token.replace(/^--/, '') : undefined;
              const cur = colorMap.get(hex) || { tokenName: cleanTok, screenIds: new Set<string>() };
              if (!cur.tokenName && cleanTok) cur.tokenName = cleanTok;
              cur.screenIds.add(sc.id);
              colorMap.set(hex, cur);
            }
          }
        }
        if (layer.typography) {
          const t = layer.typography;
          const k = `${t.fontFamily}|${t.fontWeight}|${t.fontSize}|${t.lineHeight}`;
          const prev = typeMap.get(k);
          if (prev) {
            prev.count++;
          } else {
            typeMap.set(k, {
              key: k,
              fontFamily: t.fontFamily,
              fontWeight: t.fontWeight,
              fontSize: t.fontSize,
              lineHeight: t.lineHeight,
              sample: (layer.text || 'The quick brown fox').slice(0, 48),
              count: 1
            });
          }
        }
        if (layer.autoLayout) {
          if (layer.autoLayout.gap > 0) spacingSet.add(Math.round(layer.autoLayout.gap));
          if (layer.autoLayout.paddingTop > 0) spacingSet.add(Math.round(layer.autoLayout.paddingTop));
          if (layer.autoLayout.paddingLeft > 0) spacingSet.add(Math.round(layer.autoLayout.paddingLeft));
        }
        if (typeof layer.radius === 'number' && layer.radius > 0 && layer.radius <= 64) {
          radiusSet.add(Math.round(layer.radius));
        }
      });

      for (const a of sc.assets || []) {
        const k = `${a.name}|${a.svg || a.id}`;
        if (!seenAssetKey.has(k)) {
          seenAssetKey.add(k);
          assets.push({ ...a, screenName: sc.name });
        }
      }
    }

    const q = query.trim().toLowerCase();
    const colors: StyleColorEntry[] = Array.from(colorMap.entries())
      .map(([hex, v]) => ({ hex, tokenName: v.tokenName, screensCount: v.screenIds.size }))
      .filter(c => !q || c.hex.toLowerCase().includes(q) || (c.tokenName || '').toLowerCase().includes(q))
      .sort((a, b) => b.screensCount - a.screensCount || (b.tokenName ? 1 : 0) - (a.tokenName ? 1 : 0));

    const typography = Array.from(typeMap.values())
      .filter(
        t =>
          !q ||
          t.fontFamily.toLowerCase().includes(q) ||
          t.sample.toLowerCase().includes(q) ||
          String(t.fontSize).includes(q)
      )
      .sort((a, b) => b.fontSize - a.fontSize || b.fontWeight - a.fontWeight);

    const spacing = Array.from(spacingSet).sort((a, b) => a - b).slice(0, 14);
    const radii = Array.from(radiusSet).sort((a, b) => a - b).slice(0, 12);
    const filteredAssets = assets.filter(
      a => !q || a.name.toLowerCase().includes(q) || a.screenName.toLowerCase().includes(q)
    );

    return { colors, typography, spacing, radii, assets: filteredAssets };
  }, [screens, query]);

  const downloadSvg = (asset: AssetEntry) => {
    if (!asset.svg) return;
    const blob = new Blob([asset.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${asset.name}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadAllAssetsZip = () => {
    const svgFiles = styleguide.assets
      .filter(a => Boolean(a.svg))
      .map((a, idx) => ({
        name: `assets/${a.name || `icon-${idx + 1}`}.svg`,
        content: a.svg!
      }));
    if (!svgFiles.length) return;
    const zipBlob = makeZip(svgFiles);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devready-styleguide-assets.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const boardColumns: { status: ScreenStatus; label: string; dotClass: string }[] = [
    { status: 'ready', label: 'Ready for dev', dotClass: 'st-ready' },
    { status: 'in-progress', label: 'In progress', dotClass: 'st-in-progress' },
    { status: 'done', label: 'Completed', dotClass: 'st-done' }
  ];

  const statusLabelOf = (s: ScreenStatus) =>
    s === 'ready' ? 'Ready for dev' : s === 'in-progress' ? 'In progress' : 'Completed';
  const prevStatus = (s: ScreenStatus): ScreenStatus | null =>
    s === 'done' ? 'in-progress' : s === 'in-progress' ? 'ready' : null;
  const nextStatus = (s: ScreenStatus): ScreenStatus | null =>
    s === 'ready' ? 'in-progress' : s === 'in-progress' ? 'done' : null;

  return (
    <div
      className="rfd-feed-surface"
      style={{ left: leftOffset }}
      role="region"
      aria-label="Ready for dev hub"
    >
      <div className={`rfd-feed-inner ${hubView !== 'feed' ? 'is-wide' : ''}`}>
        {/* Top Header */}
        <header className="rfd-header">
          <div className="rfd-title-block">
            <div className="rfd-title-row">
              <span className="ready-nav-badge lg">
                <Code2 size={13} />
              </span>
              <h1>Ready for dev</h1>
              <span className="rfd-total-pill mono">{counts.all}</span>
            </div>
            <p className="rfd-subtitle">
              {counts.ready} ready · {counts.inProgress} in progress · {counts.done} completed
            </p>
          </div>

          <div className="rfd-header-actions">
            {/* Figma Feed | Peezy Board | Zeplin Styleguide Switcher */}
            <div className="rfd-hub-seg" role="tablist" aria-label="Handoff view mode">
              <button
                type="button"
                role="tab"
                aria-selected={hubView === 'feed'}
                className={hubView === 'feed' ? 'active' : ''}
                onClick={() => setHubView('feed')}
              >
                <LayoutList size={12} />
                <span>Feed</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={hubView === 'board'}
                className={hubView === 'board' ? 'active' : ''}
                onClick={() => setHubView('board')}
              >
                <Kanban size={12} />
                <span>Board</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={hubView === 'styleguide'}
                className={hubView === 'styleguide' ? 'active' : ''}
                onClick={() => setHubView('styleguide')}
              >
                <Palette size={12} />
                <span>Styleguide</span>
              </button>
            </div>

            <div className="rfd-search">
              <Search size={12} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={
                  hubView === 'styleguide' ? 'Filter colors, fonts, icons…' : 'Search screens or notes…'
                }
              />
              {query && (
                <button className="vars-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={11} />
                </button>
              )}
            </div>
            <button className="fig-btn-primary rfd-import-btn" onClick={onOpenImport}>
              <Plus size={12} />
              <span>Import</span>
            </button>
            <button className="quiet-icon-btn" onClick={onClose} title="Back to canvas (Esc)">
              <X size={15} />
            </button>
          </div>
        </header>

        {/* ================= FEED VIEW (Figma Ready for dev) ================= */}
        {hubView === 'feed' && (
          <>
            <div className="rfd-filter-bar">
              <div className="rfd-filter-pills">
                <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                  All <span className="mono">{counts.all}</span>
                </button>
                <button className={filter === 'ready' ? 'active' : ''} onClick={() => setFilter('ready')}>
                  Ready <span className="mono">{counts.ready}</span>
                </button>
                <button
                  className={filter === 'in-progress' ? 'active' : ''}
                  onClick={() => setFilter('in-progress')}
                >
                  In progress <span className="mono">{counts.inProgress}</span>
                </button>
                <button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>
                  Completed <span className="mono">{counts.done}</span>
                </button>
              </div>

              <PopoverSelect<SortBy>
                compact
                align="right"
                ariaLabel="Sort screens"
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: 'recent', label: 'Recent activity' },
                  { value: 'name', label: 'Name (A–Z)' },
                  { value: 'status', label: 'Dev status' }
                ]}
              />
            </div>

            <div className="rfd-feed-list">
              {filtered.length === 0 ? (
                <div className="rfd-empty">
                  <strong>No screens match this filter</strong>
                  <p>Switch status filters or import a fresh frame from Figma.</p>
                </div>
              ) : (
                filtered.map(sc => {
                  const latest = sc.history?.[0];
                  const hasDiff = Boolean(
                    sc.history?.some((h, idx) => Boolean(h.rootSnapshot) && !(idx === 0 && h.rootSnapshot === sc.root))
                  );
                  const doneTasks = (sc.checklist || []).filter(c => c.done).length;
                  const totalTasks = (sc.checklist || []).length;
                  const thumbScale = Math.min(540 / sc.width, 250 / sc.height, 0.72);
                  const thumbW = Math.round(sc.width * thumbScale);
                  const thumbH = Math.round(sc.height * thumbScale);

                  const statusText =
                    sc.status === 'ready'
                      ? 'marked ready for dev'
                      : sc.status === 'done'
                        ? 'marked as completed'
                        : 'updated design specs';

                  return (
                    <article key={sc.id} className="rfd-card">
                      <div className="rfd-card-activity">
                        <span className={`rfd-status-dot st-${sc.status}`} />
                        <span className="rfd-activity-line">
                          <strong>{latest?.author || 'Designer'}</strong> {statusText} ·{' '}
                          <span className="rfd-rel-time">{fmtRelDate(sc.updatedAt)}</span>
                        </span>
                      </div>
                      {(latest?.summary || sc.notes) && (
                        <div className="rfd-change-note">{latest?.summary || sc.notes}</div>
                      )}

                      <div className="rfd-card-head">
                        <button className="rfd-frame-link" onClick={() => onInspectScreen(sc.id)}>
                          <span className="rfd-page-crumb">{sc.pageName || sc.fileName || 'Screen'}</span>
                          <span className="rfd-crumb-sep">/</span>
                          <span className="rfd-frame-name">{sc.name}</span>
                          <span className="rfd-dims mono">
                            {sc.width} × {sc.height}
                          </span>
                        </button>

                        <div className="rfd-card-actions">
                          {hasDiff && (
                            <button
                              className="rfd-action-btn"
                              onClick={() => onCompareScreen(sc.id)}
                              title="Compare changes"
                            >
                              <GitCompareArrows size={12} />
                              <span>Compare</span>
                            </button>
                          )}
                          {sc.status === 'done' ? (
                            <button
                              className="rfd-action-btn is-done"
                              onClick={() => onStatusChange(sc.id, 'ready')}
                              title="Move back to Ready for dev"
                            >
                              <RotateCcw size={11} />
                              <span>Completed</span>
                            </button>
                          ) : (
                            <button
                              className="rfd-action-btn"
                              onClick={() => onStatusChange(sc.id, 'done')}
                              title="Mark development complete"
                            >
                              <CheckCircle2 size={12} />
                              <span>Mark as completed</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        className="rfd-preview-box"
                        onClick={() => onInspectScreen(sc.id)}
                        title={`Inspect ${sc.name} on canvas`}
                      >
                        <div className="rfd-thumb-artboard" style={{ width: thumbW, height: thumbH }}>
                          <ArtboardVectorView bundle={sc} scale={thumbScale} />
                        </div>
                        <span className="rfd-hover-cta">
                          <span>Inspect in Focus view</span>
                          <ArrowUpRight size={12} />
                        </span>
                      </button>

                      <div className="rfd-card-meta">
                        {totalTasks > 0 && (
                          <span>
                            <CheckCircle2 size={11} />
                            {doneTasks}/{totalTasks} tasks
                          </span>
                        )}
                        {(sc.annotations?.length || 0) > 0 && (
                          <span>
                            <MessageSquare size={11} />
                            {sc.annotations!.length} annotations
                          </span>
                        )}
                        {(sc.devResources?.length || 0) > 0 && (
                          <span>
                            <Link2 size={11} />
                            {sc.devResources!.length} resources
                          </span>
                        )}
                        <span>
                          <Sparkles size={11} />
                          {sc.tokens.length} tokens
                        </span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ================= BOARD VIEW (Peezy-Style Kanban Handoff with Drag & Drop) ================= */}
        {hubView === 'board' && (
          <div className="rfd-board-grid">
            {boardColumns.map(col => {
              const items = filtered.filter(s => s.status === col.status);
              const isDropTarget = dragOverCol === col.status && dragScreenId !== null;
              return (
                <section
                  key={col.status}
                  className={`rfd-board-col ${isDropTarget ? 'is-drag-over' : ''}`}
                  onDragOver={e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverCol !== col.status) setDragOverCol(col.status);
                  }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setDragOverCol(prev => (prev === col.status ? null : prev));
                    }
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain') || dragScreenId;
                    setDragOverCol(null);
                    setDragScreenId(null);
                    if (id) onStatusChange(id, col.status);
                  }}
                >
                  <header className="rfd-board-col-head">
                    <span className={`rfd-status-dot ${col.dotClass}`} />
                    <h2>{col.label}</h2>
                    <span className="rfd-board-count mono">{items.length}</span>
                  </header>

                  <div className="rfd-board-cards">
                    {items.length === 0 ? (
                      <div className="rfd-board-empty">
                        {isDropTarget ? `Drop to move to ${col.label}` : `Drag a screen here or use arrows`}
                      </div>
                    ) : (
                      items.map(sc => {
                        const prev = prevStatus(sc.status);
                        const next = nextStatus(sc.status);
                        const doneTasks = (sc.checklist || []).filter(c => c.done).length;
                        const totalTasks = (sc.checklist || []).length;
                        const hasDiff = Boolean(
                          sc.history?.some(
                            (h, idx) => Boolean(h.rootSnapshot) && !(idx === 0 && h.rootSnapshot === sc.root)
                          )
                        );
                        const thumbScale = Math.min(260 / sc.width, 136 / sc.height, 0.45);
                        const thumbW = Math.round(sc.width * thumbScale);
                        const thumbH = Math.round(sc.height * thumbScale);

                        return (
                          <article
                            key={sc.id}
                            className={`rfd-board-card ${dragScreenId === sc.id ? 'is-dragging' : ''}`}
                            draggable
                            onDragStart={e => {
                              setDragScreenId(sc.id);
                              e.dataTransfer.setData('text/plain', sc.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDragScreenId(null);
                              setDragOverCol(null);
                            }}
                          >
                            <button
                              className="rfd-board-thumb"
                              onClick={() => onInspectScreen(sc.id)}
                              title={`Inspect ${sc.name}`}
                            >
                              <div className="rfd-thumb-artboard" style={{ width: thumbW, height: thumbH }}>
                                <ArtboardVectorView bundle={sc} scale={thumbScale} />
                              </div>
                            </button>

                            <div className="rfd-board-body">
                              <button
                                className="rfd-board-title"
                                onClick={() => onInspectScreen(sc.id)}
                              >
                                {sc.name}
                              </button>
                              <div className="rfd-board-sub mono">
                                {sc.width} × {sc.height} · {fmtRelDate(sc.updatedAt)}
                              </div>

                              <div className="rfd-board-foot">
                                <div className="rfd-board-pills">
                                  {totalTasks > 0 && (
                                    <span className="mono">
                                      <CheckCircle2 size={10} /> {doneTasks}/{totalTasks}
                                    </span>
                                  )}
                                  {hasDiff && (
                                    <button
                                      className="rfd-board-mini-btn"
                                      onClick={() => onCompareScreen(sc.id)}
                                      title="Compare changes"
                                    >
                                      <GitCompareArrows size={11} />
                                    </button>
                                  )}
                                </div>
                                <div className="rfd-board-move">
                                  {prev && (
                                    <button
                                      className="rfd-board-mini-btn"
                                      onClick={() => onStatusChange(sc.id, prev)}
                                      title={`Move back to ${statusLabelOf(prev)}`}
                                    >
                                      <ArrowLeft size={11} />
                                    </button>
                                  )}
                                  {next && (
                                    <button
                                      className="rfd-board-mini-btn primary"
                                      onClick={() => onStatusChange(sc.id, next)}
                                      title={`Advance to ${statusLabelOf(next)}`}
                                    >
                                      <ArrowRight size={11} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* ================= STYLEGUIDE VIEW (Zeplin-Style Project Design System) ================= */}
        {hubView === 'styleguide' && (
          <div className="sg-wrap">
            {query.trim() &&
            styleguide.colors.length === 0 &&
            styleguide.typography.length === 0 &&
            styleguide.assets.length === 0 ? (
              <div className="rfd-empty">
                <strong>No styleguide items match &ldquo;{query.trim()}&rdquo;</strong>
                <p>Try searching a hex code, token name, font family, or icon name.</p>
              </div>
            ) : (
              <>
            {/* Colors */}
            {styleguide.colors.length > 0 && (
            <section className="sg-section">
              <div className="sg-sec-head">
                <h2>Color palette</h2>
                <span className="mono sg-sec-count">{styleguide.colors.length} colors across {screens.length} screens</span>
              </div>
              <div className="sg-color-grid">
                {styleguide.colors.map(c => {
                  const tokenCss = c.tokenName ? `var(--${c.tokenName})` : c.hex;
                  const id = `c-${c.hex}`;
                  return (
                    <button
                      key={c.hex}
                      className="sg-color-card"
                      onClick={() => copyQuick(tokenCss, id)}
                      title={`Click to copy ${tokenCss}`}
                    >
                      <span className="sg-color-swatch" style={{ background: c.hex }} />
                      <div className="sg-color-meta">
                        <span className="sg-color-name">{c.tokenName || c.hex}</span>
                        <span className="sg-color-val mono">
                          {copiedId === id ? 'Copied!' : `${c.hex} · ${c.screensCount} sc`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
            )}

            {/* Typography Scale */}
            {styleguide.typography.length > 0 && (
            <section className="sg-section">
              <div className="sg-sec-head">
                <h2>Typography scale</h2>
                <span className="mono sg-sec-count">{styleguide.typography.length} unique styles</span>
              </div>
              <div className="sg-type-list">
                {styleguide.typography.slice(0, 12).map(t => {
                  const css = `font-family: '${t.fontFamily}', sans-serif; font-weight: ${t.fontWeight}; font-size: ${t.fontSize}px; line-height: ${t.lineHeight}px;`;
                  const id = `t-${t.key}`;
                  return (
                    <button
                      key={t.key}
                      className="sg-type-row"
                      onClick={() => copyQuick(css, id)}
                      title="Click to copy typography CSS"
                    >
                      <div className="sg-type-info">
                        <span className="sg-type-family">{t.fontFamily}</span>
                        <span className="sg-type-stats mono">
                          {t.fontWeight} · {t.fontSize}px / {t.lineHeight}px · {t.count}×
                        </span>
                      </div>
                      <div
                        className="sg-type-sample"
                        style={{
                          fontFamily: `${t.fontFamily}, Inter, sans-serif`,
                          fontWeight: t.fontWeight,
                          fontSize: `${Math.min(26, Math.max(12, t.fontSize))}px`
                        }}
                      >
                        {t.sample}
                      </div>
                      <span className="sg-copy-ic">
                        {copiedId === id ? <Check size={12} /> : <Copy size={12} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            )}

            {/* Spacing & Border Radius */}
            {(styleguide.spacing.length > 0 || styleguide.radii.length > 0) && (
              <div className="sg-two-col">
                <section className="sg-section">
                  <div className="sg-sec-head">
                    <h2>Spacing scale</h2>
                    <span className="mono sg-sec-count">{styleguide.spacing.length} values</span>
                  </div>
                  <div className="sg-scale-list">
                    {styleguide.spacing.map(v => {
                      const id = `sp-${v}`;
                      return (
                        <button
                          key={v}
                          className="sg-scale-row"
                          onClick={() => copyQuick(`${v}px`, id)}
                          title={`Copy ${v}px`}
                        >
                          <span className="sg-scale-lbl mono">{copiedId === id ? 'Copied' : `${v}px`}</span>
                          <span className="sg-scale-bar-wrap">
                            <span className="sg-scale-bar" style={{ width: `${Math.min(180, Math.max(6, v * 2.5))}px` }} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="sg-section">
                  <div className="sg-sec-head">
                    <h2>Border radius</h2>
                    <span className="mono sg-sec-count">{styleguide.radii.length} values</span>
                  </div>
                  <div className="sg-radii-grid">
                    {styleguide.radii.map(r => {
                      const id = `rd-${r}`;
                      return (
                        <button
                          key={r}
                          className="sg-radius-chip"
                          onClick={() => copyQuick(`border-radius: ${r}px;`, id)}
                          title={`Copy border-radius: ${r}px;`}
                        >
                          <span className="sg-radius-box" style={{ borderRadius: `${Math.min(18, r)}px` }} />
                          <span className="mono">{copiedId === id ? 'Copied' : `${r}px`}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* SVG Asset Sheet */}
            {styleguide.assets.length > 0 && (
              <section className="sg-section">
                <div className="sg-sec-head">
                  <h2>Vector assets</h2>
                  <button className="rfd-action-btn" onClick={downloadAllAssetsZip}>
                    <Archive size={12} />
                    <span>Download all ZIP ({styleguide.assets.length})</span>
                  </button>
                </div>
                <div className="sg-asset-grid">
                  {styleguide.assets.map(a => {
                    const id = `as-${a.id}-${a.name}`;
                    return (
                      <div key={id} className="sg-asset-card">
                        <div
                          className="sg-asset-preview"
                          dangerouslySetInnerHTML={{ __html: a.svg || '' }}
                        />
                        <div className="sg-asset-name" title={a.name}>
                          {a.name}
                        </div>
                        <div className="sg-asset-foot">
                          <span className="mono">
                            {a.width}×{a.height}
                          </span>
                          <div className="sg-asset-btns">
                            {a.svg && (
                              <button
                                className="quiet-icon-btn"
                                onClick={() => copyQuick(a.svg!, id)}
                                title="Copy SVG code"
                              >
                                {copiedId === id ? <Check size={11} /> : <Copy size={11} />}
                              </button>
                            )}
                            {a.svg && (
                              <button
                                className="quiet-icon-btn"
                                onClick={() => downloadSvg(a)}
                                title="Download SVG"
                              >
                                <Download size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
