import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  Clock,
  Code2,
  FolderInput,
  Keyboard,
  LayoutGrid,
  Link2,
  List,
  Moon,
  Pencil,
  Plug,
  Plus,
  Search,
  Share2,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import type { DevReadyBundle, InspectLayer, ScreenStatus } from '../types';
import { ArtboardVectorView } from './ArtboardVectorView';
import { PopoverSelect } from './PopoverSelect';
import type { ImportTab } from './TransferModal';
import { fmtMod } from '../lib/platform';

export type WorkspaceSection = 'recents' | 'imports' | 'ready' | 'samples';
type SortMode = 'recent' | 'modified' | 'name' | 'layers';

interface WorkspaceHomeProps {
  screens: DevReadyBundle[];
  recentsMap: Record<string, number>;
  lastActiveScreen: DevReadyBundle | null;
  hasVisitedEditor: boolean;
  theme: 'dark' | 'light';
  onOpenScreen: (id: string) => void;
  onShareScreen: (id: string) => void;
  onRenameScreen: (id: string, name: string) => void;
  onStatusChange: (id: string, status: ScreenStatus) => void;
  onDeleteScreen: (id: string) => void;
  onOpenImport: (tab?: ImportTab) => void;
  onToggleTheme: () => void;
  onOpenCmdK: () => void;
  onOpenShortcuts: () => void;
}

const STATUS_META: Record<ScreenStatus, { label: string; dot: string }> = {
  ready: { label: 'Ready for dev', dot: '#14AE5C' },
  'in-progress': { label: 'In progress', dot: '#F59E0B' },
  done: { label: 'Completed', dot: '#0D99FF' }
};

function countLayers(layer: InspectLayer): number {
  let total = 1;
  if (layer.children) {
    for (const c of layer.children) total += countLayers(c);
  }
  return total;
}

function fmtRelativeTime(tsMs: number): string {
  const diff = Math.max(0, Date.now() - tsMs);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(tsMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sourceLabel(src: DevReadyBundle['source']): string {
  switch (src) {
    case 'figma-plugin':
      return 'Figma Plugin';
    case 'figma-api':
      return 'Figma URL';
    case 'cloud-link':
      return 'Shared Link';
    case 'file':
      return 'JSON Import';
    default:
      return 'Sample';
  }
}

export const WorkspaceHome: React.FC<WorkspaceHomeProps> = ({
  screens,
  recentsMap,
  lastActiveScreen,
  hasVisitedEditor,
  theme,
  onOpenScreen,
  onShareScreen,
  onRenameScreen,
  onStatusChange,
  onDeleteScreen,
  onOpenImport,
  onToggleTheme,
  onOpenCmdK,
  onOpenShortcuts
}) => {
  const [section, setSection] = useState<WorkspaceSection>('recents');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ScreenStatus>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const layerCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const sc of screens) map.set(sc.id, countLayers(sc.root));
    return map;
  }, [screens]);

  const counts = useMemo(() => {
    const imports = screens.filter(s => s.source !== 'demo').length;
    const ready = screens.filter(s => s.status === 'ready').length;
    const samples = screens.filter(s => s.source === 'demo').length;
    return { all: screens.length, imports, ready, samples };
  }, [screens]);

  const visibleScreens = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = screens.filter(sc => {
      if (section === 'imports' && sc.source === 'demo') return false;
      if (section === 'ready' && sc.status !== 'ready') return false;
      if (section === 'samples' && sc.source !== 'demo') return false;
      if (statusFilter !== 'all' && sc.status !== statusFilter) return false;
      if (!q) return true;
      return (
        sc.name.toLowerCase().includes(q) ||
        (sc.fileName || '').toLowerCase().includes(q) ||
        (sc.pageName || '').toLowerCase().includes(q) ||
        (sc.notes || '').toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'layers') return (layerCounts.get(b.id) || 0) - (layerCounts.get(a.id) || 0);
      if (sortMode === 'modified') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      // 'recent': imported files & recently opened items float cleanly to top
      const ta = recentsMap[a.id] || new Date(a.updatedAt).getTime();
      const tb = recentsMap[b.id] || new Date(b.updatedAt).getTime();
      if (ta !== tb) return tb - ta;
      if ((a.source !== 'demo') !== (b.source !== 'demo')) return a.source !== 'demo' ? -1 : 1;
      return 0;
    });
    return list;
  }, [screens, section, statusFilter, query, sortMode, recentsMap, layerCounts]);

  const startRename = (sc: DevReadyBundle, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
    setRenamingId(sc.id);
    setRenameDraft(sc.name);
  };

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      onRenameScreen(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
  };

  const sectionTitle =
    section === 'recents'
      ? 'Recents'
      : section === 'imports'
        ? 'My imports'
        : section === 'ready'
          ? 'Ready for dev'
          : 'Sample files';

  return (
    <div className="ws-shell">
      {/* Left Workspace Navigation Rail */}
      <aside className="ws-rail">
        <div className="ws-brand">
          <div className="ws-logo" aria-hidden="true">
            <span className="ws-logo-q q1" />
            <span className="ws-logo-q q2" />
            <span className="ws-logo-q q3" />
            <span className="ws-logo-q q4" />
          </div>
          <div className="ws-brand-text">
            <div className="ws-brand-name">DevReady Studio</div>
            <div className="ws-brand-sub">Free Figma Dev Mode</div>
          </div>
        </div>

        <div className="ws-rail-cta-wrap">
          <button
            type="button"
            className="ws-primary-cta"
            onClick={() => onOpenImport('figma-url')}
          >
            <Plus size={14} />
            <span>Import from Figma</span>
          </button>
        </div>

        <nav className="ws-nav" aria-label="Workspace navigation">
          <button
            type="button"
            className={`ws-nav-item ${section === 'recents' ? 'active' : ''}`}
            onClick={() => setSection('recents')}
          >
            <Clock size={14} />
            <span>Recents</span>
            <span className="ws-nav-count mono">{counts.all}</span>
          </button>
          <button
            type="button"
            className={`ws-nav-item ${section === 'imports' ? 'active' : ''}`}
            onClick={() => setSection('imports')}
          >
            <FolderInput size={14} />
            <span>My imports</span>
            <span className="ws-nav-count mono">{counts.imports}</span>
          </button>
          <button
            type="button"
            className={`ws-nav-item ${section === 'ready' ? 'active' : ''}`}
            onClick={() => setSection('ready')}
          >
            <Code2 size={14} />
            <span>Ready for dev</span>
            <span className="ws-nav-count mono ready">{counts.ready}</span>
          </button>
          <button
            type="button"
            className={`ws-nav-item ${section === 'samples' ? 'active' : ''}`}
            onClick={() => setSection('samples')}
          >
            <Sparkles size={14} />
            <span>Sample files</span>
            <span className="ws-nav-count mono">{counts.samples}</span>
          </button>
        </nav>

        <div className="ws-rail-section-label">Transfer methods</div>
        <div className="ws-rail-shortcuts">
          <button
            type="button"
            className="ws-rail-mini"
            onClick={() => onOpenImport('figma-url')}
          >
            <Link2 size={13} />
            <span>Figma file URL</span>
          </button>
          <button
            type="button"
            className="ws-rail-mini"
            onClick={() => onOpenImport('plugin')}
          >
            <Plug size={13} />
            <span>Figma Bridge plugin</span>
          </button>
          <button
            type="button"
            className="ws-rail-mini"
            onClick={() => onOpenImport('paste')}
          >
            <ClipboardPaste size={13} />
            <span>Paste bundle</span>
            <kbd>{fmtMod('V')}</kbd>
          </button>
        </div>

        <div className="ws-rail-foot">
          <button
            type="button"
            className="ws-foot-btn"
            onClick={onOpenCmdK}
            title={`Command menu (${fmtMod('K')})`}
          >
            <Search size={13} />
            <span>{fmtMod('K')}</span>
          </button>
          <button
            type="button"
            className="ws-foot-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            type="button"
            className="ws-foot-btn"
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={13} />
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="ws-main">
        {/* Top Bar */}
        <header className="ws-topbar">
          <div className="ws-topbar-left">
            <h1 className="ws-title">{sectionTitle}</h1>
            <span className="ws-count-pill mono">{visibleScreens.length}</span>
          </div>

          <div className="ws-topbar-right">
            <div className="ws-search">
              <Search size={13} className="ws-search-ic" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search screens, files, pages…"
                aria-label="Search projects"
              />
              {query && (
                <button
                  type="button"
                  className="ws-search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {hasVisitedEditor && lastActiveScreen && (
              <button
                type="button"
                className="ws-resume-btn"
                onClick={() => onOpenScreen(lastActiveScreen.id)}
                title={`Return to ${lastActiveScreen.name}`}
              >
                <span>Back to editor</span>
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        </header>

        <div className="ws-scroll">
          {/* Quick-Start Import Strip */}
          {(section === 'recents' || section === 'imports') && !query && (
            <section className="ws-quickstart" aria-label="Import from Figma">
              <button
                type="button"
                className="ws-quick-card"
                onClick={() => onOpenImport('figma-url')}
              >
                <div className="ws-quick-ic blue">
                  <Link2 size={15} />
                </div>
                <div className="ws-quick-body">
                  <div className="ws-quick-title">Import via Figma URL</div>
                  <div className="ws-quick-sub">
                    Paste any figma.com link — no plugin required
                  </div>
                </div>
                <ArrowRight size={13} className="ws-quick-arrow" />
              </button>

              <button
                type="button"
                className="ws-quick-card"
                onClick={() => onOpenImport('plugin')}
              >
                <div className="ws-quick-ic green">
                  <Plug size={15} />
                </div>
                <div className="ws-quick-body">
                  <div className="ws-quick-title">Figma Bridge Plugin</div>
                  <div className="ws-quick-sub">
                    1-click live frame sync with 2× PNG & SVGs
                  </div>
                </div>
                <ArrowRight size={13} className="ws-quick-arrow" />
              </button>

              <button
                type="button"
                className="ws-quick-card"
                onClick={() => onOpenImport('file')}
              >
                <div className="ws-quick-ic purple">
                  <Upload size={15} />
                </div>
                <div className="ws-quick-body">
                  <div className="ws-quick-title">Drop .devready.json or Paste</div>
                  <div className="ws-quick-sub">
                    Drag a file anywhere here or press {fmtMod('V')}
                  </div>
                </div>
                <ArrowRight size={13} className="ws-quick-arrow" />
              </button>
            </section>
          )}

          {/* Filter & View Controls */}
          <div className="ws-controls">
            <div className="ws-filter-pills" role="group" aria-label="Filter by status">
              {(['all', 'ready', 'in-progress', 'done'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  className={`ws-pill ${statusFilter === st ? 'active' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st !== 'all' && (
                    <span className="ws-pill-dot" style={{ background: STATUS_META[st].dot }} />
                  )}
                  <span>{st === 'all' ? 'All statuses' : STATUS_META[st].label}</span>
                </button>
              ))}
            </div>

            <div className="ws-controls-right">
              <PopoverSelect
                value={sortMode}
                onChange={v => setSortMode(v as SortMode)}
                options={[
                  { value: 'recent', label: 'Recently opened' },
                  { value: 'modified', label: 'Last modified' },
                  { value: 'name', label: 'Name (A–Z)' },
                  { value: 'layers', label: 'Most layers' }
                ]}
              />

              <div className="ws-view-toggle" role="group" aria-label="Layout view">
                <button
                  type="button"
                  className={layout === 'grid' ? 'active' : ''}
                  onClick={() => setLayout('grid')}
                  title="Grid view"
                  aria-label="Grid view"
                >
                  <LayoutGrid size={13} />
                </button>
                <button
                  type="button"
                  className={layout === 'list' ? 'active' : ''}
                  onClick={() => setLayout('list')}
                  title="List view"
                  aria-label="List view"
                >
                  <List size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {visibleScreens.length === 0 ? (
            <div className="ws-empty">
              <div className="ws-empty-ic">
                {section === 'imports' ? <FolderInput size={22} /> : <Search size={22} />}
              </div>
              <h2>
                {section === 'imports' && !query && statusFilter === 'all'
                  ? 'No imported Figma files yet'
                  : 'No matching screens'}
              </h2>
              <p>
                {section === 'imports' && !query && statusFilter === 'all'
                  ? 'Import directly from a Figma URL, send a frame with the Figma Bridge plugin, or drop a .devready.json bundle onto this window.'
                  : 'Try clearing your search query or switching status filters.'}
              </p>
              <div className="ws-empty-actions">
                {section === 'imports' && !query && statusFilter === 'all' ? (
                  <>
                    <button
                      type="button"
                      className="fig-btn-primary"
                      onClick={() => onOpenImport('figma-url')}
                    >
                      Import via Figma URL
                    </button>
                    <button
                      type="button"
                      className="fig-btn-ghost"
                      onClick={() => setSection('samples')}
                    >
                      Explore sample files
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="fig-btn-ghost"
                    onClick={() => {
                      setQuery('');
                      setStatusFilter('all');
                    }}
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          ) : layout === 'grid' ? (
            /* Project Cards Grid */
            <div className="ws-grid">
              {visibleScreens.map(sc => {
                const isSample = sc.source === 'demo';
                const layers = layerCounts.get(sc.id) || 1;
                const recentTs = recentsMap[sc.id];
                const timeLabel = recentTs
                  ? `Opened ${fmtRelativeTime(recentTs)}`
                  : `Edited ${fmtRelativeTime(new Date(sc.updatedAt).getTime())}`;
                const previewScale = Math.min(280 / Math.max(sc.width, 1), 162 / Math.max(sc.height, 1));

                return (
                  <div
                    key={sc.id}
                    className="ws-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (renamingId !== sc.id) onOpenScreen(sc.id);
                    }}
                    onKeyDown={e => {
                      if (renamingId === sc.id) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenScreen(sc.id);
                      }
                    }}
                  >
                    {/* Live Miniature Artboard Thumbnail */}
                    <div className="ws-card-thumb">
                      {sc.screenshotDataUrl ? (
                        <img
                          src={sc.screenshotDataUrl}
                          alt={sc.name}
                          className="ws-card-shot"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="ws-card-vec-wrap"
                          style={{
                            width: Math.max(40, Math.round(sc.width * previewScale)),
                            height: Math.max(30, Math.round(sc.height * previewScale))
                          }}
                        >
                          <ArtboardVectorView bundle={sc} scale={previewScale} />
                        </div>
                      )}

                      <span className={`ws-source-tag ${isSample ? 'sample' : 'imported'}`}>
                        {sourceLabel(sc.source)}
                      </span>

                      <div className="ws-card-hover-bar" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="ws-card-act"
                          title="Share encrypted link"
                          aria-label={`Share ${sc.name}`}
                          onClick={() => onShareScreen(sc.id)}
                        >
                          <Share2 size={12} />
                        </button>
                        <button
                          type="button"
                          className="ws-card-act"
                          title="Rename"
                          aria-label={`Rename ${sc.name}`}
                          onClick={e => startRename(sc, e)}
                        >
                          <Pencil size={12} />
                        </button>
                        {!isSample &&
                          (confirmDeleteId === sc.id ? (
                            <button
                              type="button"
                              className="ws-card-act danger-confirm"
                              title="Confirm delete"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                onDeleteScreen(sc.id);
                              }}
                            >
                              <Check size={12} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ws-card-act danger"
                              title="Remove project"
                              aria-label={`Remove ${sc.name}`}
                              onClick={() => setConfirmDeleteId(sc.id)}
                            >
                              <Trash2 size={12} />
                            </button>
                          ))}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="ws-card-foot">
                      <div className="ws-card-title-row">
                        {renamingId === sc.id ? (
                          <form
                            className="ws-rename-form"
                            onClick={e => e.stopPropagation()}
                            onSubmit={e => {
                              e.preventDefault();
                              commitRename();
                            }}
                          >
                            <input
                              type="text"
                              className="ws-rename-input"
                              value={renameDraft}
                              autoFocus
                              onChange={e => setRenameDraft(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={e => {
                                if (e.key === 'Escape') {
                                  e.stopPropagation();
                                  setRenamingId(null);
                                }
                              }}
                            />
                          </form>
                        ) : (
                          <div className="ws-card-name" title={sc.name}>
                            {sc.name}
                          </div>
                        )}
                        <span
                          className="ws-status-dot"
                          style={{ background: STATUS_META[sc.status].dot }}
                          title={STATUS_META[sc.status].label}
                        />
                      </div>

                      <div className="ws-card-sub">
                        <span className="ws-card-file" title={sc.fileName || sc.pageName}>
                          {sc.fileName || sc.pageName || 'Figma Frame'}
                        </span>
                        <span className="ws-card-sep">·</span>
                        <span className="mono">
                          {sc.width}×{sc.height}
                        </span>
                      </div>

                      <div className="ws-card-meta">
                        <span className="mono">
                          {layers} layers · {sc.tokens.length} tokens
                        </span>
                        <span className="ws-card-time">{timeLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List / Table View */
            <div className="ws-list">
              <div className="ws-list-head">
                <span>Screen</span>
                <span>Status</span>
                <span>Size</span>
                <span>Layers</span>
                <span>Activity</span>
                <span aria-hidden="true" />
              </div>
              {visibleScreens.map(sc => {
                const isSample = sc.source === 'demo';
                const layers = layerCounts.get(sc.id) || 1;
                const recentTs = recentsMap[sc.id];
                const timeLabel = recentTs
                  ? `Opened ${fmtRelativeTime(recentTs)}`
                  : `Edited ${fmtRelativeTime(new Date(sc.updatedAt).getTime())}`;
                const miniScale = Math.min(44 / Math.max(sc.width, 1), 28 / Math.max(sc.height, 1));

                return (
                  <div
                    key={sc.id}
                    className="ws-list-row"
                    onClick={() => onOpenScreen(sc.id)}
                  >
                    <div className="ws-list-main">
                      <div className="ws-list-thumb">
                        {sc.screenshotDataUrl ? (
                          <img src={sc.screenshotDataUrl} alt="" />
                        ) : (
                          <div
                            style={{
                              width: Math.max(12, Math.round(sc.width * miniScale)),
                              height: Math.max(10, Math.round(sc.height * miniScale)),
                              overflow: 'hidden',
                              borderRadius: 2
                            }}
                          >
                            <ArtboardVectorView bundle={sc} scale={miniScale} />
                          </div>
                        )}
                      </div>
                      <div className="ws-list-titles">
                        <div className="ws-list-name">{sc.name}</div>
                        <div className="ws-list-sub">
                          <span>{sc.fileName || sc.pageName || 'Figma Frame'}</span>
                          <span>·</span>
                          <span>{sourceLabel(sc.source)}</span>
                        </div>
                      </div>
                    </div>

                    <div onClick={e => e.stopPropagation()}>
                      <PopoverSelect
                        value={sc.status}
                        onChange={v => onStatusChange(sc.id, v as ScreenStatus)}
                        options={[
                          { value: 'ready', label: 'Ready for dev', dotColor: '#14AE5C' },
                          { value: 'in-progress', label: 'In progress', dotColor: '#F59E0B' },
                          { value: 'done', label: 'Completed', dotColor: '#0D99FF' }
                        ]}
                      />
                    </div>

                    <div className="mono ws-list-dim">
                      {sc.width}×{sc.height}
                    </div>
                    <div className="mono ws-list-dim">{layers}</div>
                    <div className="ws-list-time">{timeLabel}</div>

                    <div className="ws-list-acts" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className="quiet-icon-btn"
                        title="Share link"
                        onClick={() => onShareScreen(sc.id)}
                      >
                        <Share2 size={13} />
                      </button>
                      {!isSample && (
                        <button
                          type="button"
                          className="quiet-icon-btn"
                          title="Remove"
                          onClick={() => onDeleteScreen(sc.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
