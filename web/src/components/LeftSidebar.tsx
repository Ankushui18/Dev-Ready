import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Code2,
  Columns3,
  Component,
  Diamond,
  Frame,
  Image as ImageIcon,
  Keyboard,
  Moon,
  PanelLeftClose,
  PenTool,
  Plus,
  Rows3,
  Search,
  Square,
  Sun,
  Trash2,
  Type,
  X
} from 'lucide-react';
import type { DevReadyBundle, InspectLayer, ScreenStatus, UnitMode } from '../types';
import { PopoverSelect } from './PopoverSelect';
import { ArtboardVectorView } from './ArtboardVectorView';
import { fmtMod } from '../lib/platform';

function fmtEditedAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `Edited ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Edited ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `Edited ${days}d ago`;
}

interface LeftSidebarProps {
  width: number;
  screens: DevReadyBundle[];
  activeScreen: DevReadyBundle;
  selectedId: string;
  hoveredId: string | null;
  unit: UnitMode;
  theme: 'dark' | 'light';
  showReadyFeed: boolean;
  onToggleReadyFeed: () => void;
  onResizeWidth: (w: number) => void;
  onUnitChange: (u: UnitMode) => void;
  onToggleTheme: () => void;
  onCollapse: () => void;
  onOpenCmdK: () => void;
  onOpenShortcuts: () => void;
  onSelectLayer: (id: string) => void;
  onHoverLayer: (id: string | null) => void;
  onSelectScreen: (id: string) => void;
  onStatusChange: (id: string, status: ScreenStatus) => void;
  onDeleteScreen: (id: string) => void;
  onOpenImport: () => void;
}

const STATUS_DOT: Record<ScreenStatus, string> = {
  ready: '#14AE5C',
  'in-progress': '#F59E0B',
  done: '#0D99FF'
};

function LayerIcon({ node }: { node: InspectLayer }) {
  if (node.type === 'COMPONENT') return <Component size={12} className="l-ic comp" />;
  if (node.type === 'INSTANCE') return <Diamond size={11} className="l-ic comp" />;
  if (node.type === 'TEXT') return <Type size={12} className="l-ic" />;
  if (node.type === 'VECTOR') return <PenTool size={11} className="l-ic" />;
  if (node.type === 'IMAGE') return <ImageIcon size={12} className="l-ic" />;
  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE') return <Square size={11} className="l-ic" />;
  if (node.type === 'GROUP') return <Box size={12} className="l-ic" />;
  if (node.autoLayout) {
    return node.autoLayout.direction === 'HORIZONTAL'
      ? <Columns3 size={12} className="l-ic" />
      : <Rows3 size={12} className="l-ic" />;
  }
  return <Frame size={12} className="l-ic" />;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  width,
  screens,
  activeScreen,
  selectedId,
  hoveredId,
  unit,
  theme,
  showReadyFeed,
  onToggleReadyFeed,
  onResizeWidth,
  onUnitChange,
  onToggleTheme,
  onCollapse,
  onOpenCmdK,
  onOpenShortcuts,
  onSelectLayer,
  onHoverLayer,
  onSelectScreen,
  onStatusChange,
  onDeleteScreen,
  onOpenImport
}) => {
  const [tab, setTab] = useState<'layers' | 'screens'>('layers');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [readyStripOpen, setReadyStripOpen] = useState(true);
  const selectedRowRef = useRef<HTMLDivElement>(null);

  // Clear layer search query cleanly when switching screens
  useEffect(() => {
    setQuery('');
  }, [activeScreen.id]);

  // Auto-expand ancestor chain whenever a nested layer is clicked on canvas
  useEffect(() => {
    const ancestors: string[] = [];
    const findPath = (node: InspectLayer): boolean => {
      if (node.id === selectedId) return true;
      if (node.children) {
        for (const c of node.children) {
          if (findPath(c)) {
            ancestors.push(node.id);
            return true;
          }
        }
      }
      return false;
    };
    findPath(activeScreen.root);
    if (ancestors.length > 0) {
      setCollapsed(prev => {
        let changed = false;
        const next = { ...prev };
        for (const id of ancestors) {
          if (next[id]) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
    const t = window.setTimeout(() => {
      selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 20);
    return () => window.clearTimeout(t);
  }, [selectedId, activeScreen.root]);

  const containerIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (n: InspectLayer, depth: number) => {
      if (depth > 0 && n.children && n.children.length > 0) ids.push(n.id);
      if (n.children) n.children.forEach(c => walk(c, depth + 1));
    };
    walk(activeScreen.root, 0);
    return ids;
  }, [activeScreen.root]);

  const anyCollapsed = containerIds.some(id => Boolean(collapsed[id]));
  const toggleCollapseAll = () => {
    if (anyCollapsed) {
      setCollapsed({});
    } else {
      const next: Record<string, boolean> = {};
      containerIds.forEach(id => { next[id] = true; });
      setCollapsed(next);
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const onMove = (ev: MouseEvent) => {
      onResizeWidth(Math.max(210, Math.min(360, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const normalizedQuery = query.trim().toLowerCase();

  const matchesSearch = (layer: InspectLayer): boolean => {
    if (!normalizedQuery) return true;
    if (layer.name.toLowerCase().includes(normalizedQuery)) return true;
    if (layer.text && layer.text.toLowerCase().includes(normalizedQuery)) return true;
    if (layer.componentName && layer.componentName.toLowerCase().includes(normalizedQuery)) return true;
    return Boolean(layer.children?.some(matchesSearch));
  };

  const renderNode = (node: InspectLayer, depth: number) => {
    if (node.visible === false) return null;
    if (!matchesSearch(node)) return null;

    const hasKids = Boolean(node.children && node.children.length > 0);
    const isCollapsed = collapsed[node.id] && !normalizedQuery;
    const isSelected = selectedId === node.id;
    const isHovered = hoveredId === node.id && !isSelected;
    const isComp = node.type === 'COMPONENT' || node.type === 'INSTANCE';

    return (
      <React.Fragment key={node.id}>
        <div
          ref={isSelected ? selectedRowRef : undefined}
          className={`tree-row ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isComp ? 'is-comp' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => onSelectLayer(node.id)}
          onMouseEnter={() => onHoverLayer(node.id)}
          onMouseLeave={() => onHoverLayer(null)}
        >
          <button
            className={`tree-caret ${hasKids ? '' : 'empty'}`}
            onClick={e => hasKids && toggleCollapse(node.id, e)}
            tabIndex={-1}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {hasKids ? (isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />) : null}
          </button>
          <LayerIcon node={node} />
          <span className="tree-name" title={node.name}>
            {node.name}
          </span>
          {(isSelected || isHovered) && (
            <span className="tree-dim mono">
              {Math.round(node.width)}×{Math.round(node.height)}
            </span>
          )}
        </div>
        {hasKids && !isCollapsed && node.children!.map(child => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <aside className="floating-panel left-panel" style={{ width }}>
      <div className="resize-edge resize-right" onMouseDown={startResize} title="Drag to resize" />

      <div className="panel-top-row">
        <div className="file-identity">
          <div className="fig-glyph" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="file-titles">
            <div className="file-title" title={activeScreen.fileName || 'DevReady Studio'}>
              {activeScreen.fileName || 'DevReady Studio'}
            </div>
            <div className="file-sub">{activeScreen.pageName || 'Ready for dev'}</div>
          </div>
        </div>
        <button className="quiet-icon-btn" onClick={onCollapse} title={`Hide UI (${fmtMod('\\')})`}>
          <PanelLeftClose size={14} />
        </button>
      </div>

      <div className="ready-nav-wrap">
        <button
          className={`ready-nav-btn ${showReadyFeed ? 'active' : ''}`}
          onClick={onToggleReadyFeed}
          title="Open Ready for dev handoff hub"
        >
          <span className="ready-nav-badge">
            <Code2 size={11} />
          </span>
          <span className="ready-nav-label">Ready for dev</span>
          <span className="ready-nav-count mono">
            {screens.filter(s => s.status === 'ready').length}
          </span>
        </button>
      </div>

      <div className="panel-tabs">
        <button className={`p-tab ${tab === 'layers' ? 'active' : ''}`} onClick={() => setTab('layers')}>
          Layers
        </button>
        <button className={`p-tab ${tab === 'screens' ? 'active' : ''}`} onClick={() => setTab('screens')}>
          Screens ({screens.length})
        </button>
      </div>

      {tab === 'layers' ? (
        <div className="panel-body">
          {/* Authentic Figma Dev Mode "Ready for development" mini-thumbnail cards above Layers */}
          {screens.length > 0 && (
            <div className="rfd-side-section">
              <div className="rfd-side-head-row">
                <button
                  type="button"
                  className="rfd-side-head"
                  onClick={() => setReadyStripOpen(v => !v)}
                  aria-expanded={readyStripOpen}
                >
                  <span className="rfd-side-chev">
                    {readyStripOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <span>Ready for development</span>
                  <span className="rfd-side-count mono">{screens.length}</span>
                </button>
                <button
                  type="button"
                  className="quiet-icon-btn"
                  onClick={onOpenImport}
                  title="Import frame from Figma"
                >
                  <Plus size={12} />
                </button>
              </div>
              {readyStripOpen && (
                <div className="rfd-side-list">
                  {screens.map(sc => {
                    const active = sc.id === activeScreen.id;
                    const tScale = Math.min(34 / sc.width, 38 / sc.height);
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        className={`rfd-side-card ${active ? 'active' : ''}`}
                        onClick={() => onSelectScreen(sc.id)}
                        title={`Inspect ${sc.name}`}
                      >
                        <div className="rfd-side-thumb">
                          <div
                            className="rfd-side-thumb-inner"
                            style={{
                              width: Math.max(12, Math.round(sc.width * tScale)),
                              height: Math.max(12, Math.round(sc.height * tScale))
                            }}
                          >
                            <ArtboardVectorView bundle={sc} scale={tScale} />
                          </div>
                        </div>
                        <div className="rfd-side-meta">
                          <div className="rfd-side-name">{sc.name}</div>
                          <div className="rfd-side-sub">
                            <span className="rfd-side-dot" style={{ background: STATUS_DOT[sc.status] }} />
                            <Clock size={9} />
                            <span>{fmtEditedAgo(sc.updatedAt)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="layers-search-bar">
            <div className="quiet-search flex-1">
              <Search size={12} />
              <input
                type="text"
                placeholder="Search layers…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="vars-clear-btn"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>
            {containerIds.length > 0 && (
              <button
                type="button"
                className="quiet-icon-btn"
                onClick={toggleCollapseAll}
                title={anyCollapsed ? 'Expand all layers' : 'Collapse all layers'}
              >
                {anyCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
              </button>
            )}
          </div>
          <div className="tree-scroll">
            {matchesSearch(activeScreen.root) ? (
              renderNode(activeScreen.root, 0)
            ) : (
              <div className="tree-empty">No layers match &ldquo;{query.trim()}&rdquo;</div>
            )}
          </div>
        </div>
      ) : (
        <div className="panel-body">
          <div className="screen-list">
            {screens.map(sc => {
              const active = sc.id === activeScreen.id;
              return (
                <div
                  key={sc.id}
                  className={`screen-row ${active ? 'active' : ''}`}
                  onClick={() => onSelectScreen(sc.id)}
                >
                  <div className="screen-row-main">
                    <span className="status-mini-dot" style={{ background: STATUS_DOT[sc.status] }} />
                    <div className="screen-row-text">
                      <div className="screen-row-name">{sc.name}</div>
                      <div className="screen-row-dim mono">
                        {Math.round(sc.width)} × {Math.round(sc.height)}
                      </div>
                    </div>
                    {screens.length > 1 && (
                      <button
                        className="quiet-icon-btn row-del"
                        onClick={e => {
                          e.stopPropagation();
                          onDeleteScreen(sc.id);
                        }}
                        title="Remove screen"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <div className="screen-row-status" onClick={e => e.stopPropagation()}>
                    <PopoverSelect
                      value={sc.status}
                      compact
                      options={[
                        { value: 'ready', label: 'Ready for dev', dotColor: '#14AE5C' },
                        { value: 'in-progress', label: 'In progress', dotColor: '#F59E0B' },
                        { value: 'done', label: 'Completed', dotColor: '#0D99FF' }
                      ]}
                      onChange={v => onStatusChange(sc.id, v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel-footer">
        <button className="footer-cmdk" onClick={onOpenCmdK} title={`Quick actions (${fmtMod('K')})`}>
          <Search size={11} />
          <span>Actions</span>
          <kbd>{fmtMod('K')}</kbd>
        </button>

        <div className="footer-right">
          <div className="mini-unit">
            <button className={unit === 'px' ? 'active' : ''} onClick={() => onUnitChange('px')}>
              px
            </button>
            <button className={unit === 'rem' ? 'active' : ''} onClick={() => onUnitChange('rem')}>
              rem
            </button>
          </div>
          <button className="quiet-icon-btn" onClick={onOpenShortcuts} title="Keyboard shortcuts (?)">
            <Keyboard size={13} />
          </button>
          <button
            className="quiet-icon-btn"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>
    </aside>
  );
};
