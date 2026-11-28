import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Code2,
  Component,
  Copy,
  Eye,
  EyeOff,
  Frame,
  GitCompareArrows,
  Minus,
  Plus,
  Square,
  Type,
  X
} from 'lucide-react';
import type { DevReadyBundle, InspectLayer, UnitMode, VersionHistoryEntry } from '../types';
import {
  buildLayerDiffCards,
  diffLayerTrees,
  type DiffCodeLang,
  type DiffCodeLine,
  type LayerDiffEntry
} from '../lib/diff';
import { PopoverSelect } from './PopoverSelect';
import { ArtboardVectorView } from './ArtboardVectorView';

interface CompareChangesModalProps {
  bundle: DevReadyBundle;
  unit: UnitMode;
  activeMode?: string;
  initialHistoryId?: string;
  initialLayerId?: string;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

function LayerMiniIcon({ type }: { type: InspectLayer['type'] }) {
  if (type === 'TEXT') return <Type size={12} />;
  if (type === 'COMPONENT' || type === 'INSTANCE') return <Component size={12} />;
  if (type === 'FRAME' || type === 'GROUP') return <Frame size={12} />;
  return <Square size={12} />;
}

function fmtHistoryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const CompareChangesModal: React.FC<CompareChangesModalProps> = ({
  bundle,
  unit,
  activeMode,
  initialHistoryId,
  initialLayerId,
  onClose,
  onNotify
}) => {
  // Comparable snapshots = history entries that carry a rootSnapshot and differ from current (or older entries)
  const snapshots = useMemo<VersionHistoryEntry[]>(() => {
    const list = (bundle.history || []).filter(h => Boolean(h.rootSnapshot));
    // Prefer older entries (skip index 0 if it points to the exact same root ref and there are older snapshots)
    const older = list.filter((h, idx) => !(idx === 0 && h.rootSnapshot === bundle.root));
    return older.length > 0 ? older : list;
  }, [bundle.history, bundle.root]);

  const [selectedHistoryId, setSelectedHistoryId] = useState<string>(() => {
    if (initialHistoryId && snapshots.some(s => s.id === initialHistoryId)) return initialHistoryId;
    return snapshots[0]?.id || '';
  });

  const activeSnapshot = useMemo(
    () => snapshots.find(s => s.id === selectedHistoryId) || snapshots[0] || null,
    [snapshots, selectedHistoryId]
  );

  const prevBundle = useMemo<DevReadyBundle | null>(
    () => (activeSnapshot?.rootSnapshot ? { ...bundle, root: activeSnapshot.rootSnapshot } : null),
    [bundle, activeSnapshot]
  );

  const layerDiffs = useMemo<LayerDiffEntry[]>(() => {
    if (!activeSnapshot?.rootSnapshot) return [];
    return diffLayerTrees(activeSnapshot.rootSnapshot, bundle.root, unit);
  }, [activeSnapshot, bundle.root, unit]);

  const changedLayers = useMemo(
    () => layerDiffs.filter(d => d.status !== 'unchanged'),
    [layerDiffs]
  );

  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'side-by-side' | 'overlay' | 'split'>('side-by-side');
  const [overlayOpacity, setOverlayOpacity] = useState(55);
  const [splitPct, setSplitPct] = useState(50);
  const [showCurrentOverlay, setShowCurrentOverlay] = useState(true);
  const [rightTab, setRightTab] = useState<'code' | 'properties'>('code');
  const [diffLang, setDiffLang] = useState<DiffCodeLang>('css');
  const [zoomMul, setZoomMul] = useState<number>(1);
  const [copiedCard, setCopiedCard] = useState<'layout' | 'style' | null>(null);
  const [stageSize, setStageSize] = useState({ w: 540, h: 460 });
  const stageRef = useRef<HTMLDivElement>(null);

  // Pick initial changed layer cleanly whenever snapshot changes
  useEffect(() => {
    if (initialLayerId && changedLayers.some(c => c.id === initialLayerId)) {
      setSelectedLayerId(initialLayerId);
      return;
    }
    setSelectedLayerId(prev =>
      changedLayers.some(c => c.id === prev) ? prev : changedLayers[0]?.id || bundle.root.id
    );
  }, [activeSnapshot?.id, changedLayers, initialLayerId, bundle.root.id]);

  // Measure center visual stage for crisp auto-fit scaling
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0) {
        setStageSize({ w: r.width, h: r.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selectedEntry = useMemo(
    () =>
      layerDiffs.find(d => d.id === selectedLayerId) ||
      changedLayers[0] ||
      layerDiffs[0] ||
      null,
    [layerDiffs, changedLayers, selectedLayerId]
  );

  const codeCards = useMemo(
    () =>
      selectedEntry
        ? buildLayerDiffCards(selectedEntry.before, selectedEntry.after, diffLang, unit)
        : { layout: [], style: [] },
    [selectedEntry, diffLang, unit]
  );

  // Compute crisp vector fit scale for center stage
  const fitScale = useMemo(() => {
    const padX = viewMode === 'side-by-side' ? 56 : 64;
    const padY = 96;
    const availW = Math.max(180, (viewMode === 'side-by-side' ? stageSize.w / 2 : stageSize.w) - padX);
    const availH = Math.max(180, stageSize.h - padY);
    const s = Math.min(availW / bundle.width, availH / bundle.height, 1);
    return Math.max(0.18, s);
  }, [stageSize.w, stageSize.h, viewMode, bundle.width, bundle.height]);

  const renderScale = fitScale * zoomMul;
  const frameW = Math.round(bundle.width * renderScale);
  const frameH = Math.round(bundle.height * renderScale);

  const copyCardLines = async (card: 'layout' | 'style', lines: DiffCodeLine[]) => {
    const clean = lines
      .filter(l => l.kind !== 'removed')
      .map(l => l.text)
      .join('\n');
    if (!clean) return;
    await navigator.clipboard.writeText(clean).catch(() => {});
    setCopiedCard(card);
    onNotify(`Copied updated ${card} ${diffLang.toUpperCase()}`);
    window.setTimeout(() => setCopiedCard(null), 1300);
  };

  const renderHighlightBox = (layer: InspectLayer | undefined, status: LayerDiffEntry['status']) => {
    if (!layer || layer.id === bundle.root.id) return null;
    const tone =
      status === 'added' ? 'is-added' : status === 'deleted' ? 'is-deleted' : 'is-edited';
    return (
      <div
        className={`cmp-layer-ring ${tone}`}
        style={{
          left: Math.round(layer.x * renderScale),
          top: Math.round(layer.y * renderScale),
          width: Math.max(4, Math.round(layer.width * renderScale)),
          height: Math.max(4, Math.round(layer.height * renderScale))
        }}
      />
    );
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fig-modal fig-modal-compare"
        role="dialog"
        aria-modal="true"
        aria-label="Compare changes"
        onClick={e => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="fig-modal-head">
          <div className="cmp-head-title">
            <GitCompareArrows size={14} />
            <h2>Compare changes</h2>
            <span className="cmp-head-screen">{bundle.name}</span>
          </div>
          <button className="fig-modal-close" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {/* 3-Column Figma UI3 Body */}
        {snapshots.length === 0 ? (
          <div className="cmp-empty-state">
            <GitCompareArrows size={24} />
            <strong>No previous snapshot to compare yet</strong>
            <p>
              Re-import an updated version of this screen from Figma (or open one of the demo screens) to inspect
              side-by-side visual and property-level CSS diffs.
            </p>
          </div>
        ) : (
          <div className="cmp-body">
            {/* LEFT: A. History + B. Changed Layers */}
            <aside className="cmp-left">
              <div className="cmp-pane-section">
                <div className="cmp-section-head">
                  <span>History</span>
                  <span className="cmp-count mono">{snapshots.length}</span>
                </div>
                <div className="cmp-history-list">
                  {snapshots.map(item => {
                    const isSelected = item.id === activeSnapshot?.id;
                    const statusLabel =
                      item.status === 'ready'
                        ? 'Ready for dev'
                        : item.status === 'done'
                          ? 'Completed'
                          : 'In progress';
                    return (
                      <button
                        key={item.id}
                        className={`cmp-hist-item ${isSelected ? 'active' : ''}`}
                        onClick={() => setSelectedHistoryId(item.id)}
                      >
                        <span className={`cmp-hist-badge st-${item.status || 'in-progress'}`}>
                          <Code2 size={10} />
                        </span>
                        <div className="cmp-hist-meta">
                          <div className="cmp-hist-status">{statusLabel}</div>
                          <div className="cmp-hist-note">{item.summary}</div>
                          <div className="cmp-hist-sub">
                            {item.author ? `${item.author} · ` : ''}
                            {fmtHistoryDate(item.timestamp)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="cmp-pane-section cmp-layers-section">
                <div className="cmp-section-head">
                  <span>Layers</span>
                  <span className="cmp-count mono">{changedLayers.length} changed</span>
                </div>
                <div className="cmp-layers-list">
                  {changedLayers.length === 0 ? (
                    <div className="cmp-no-diff">No layer differences detected.</div>
                  ) : (
                    changedLayers.map(entry => {
                      const active = entry.id === selectedEntry?.id;
                      return (
                        <button
                          key={entry.id}
                          className={`cmp-layer-row ${active ? 'active' : ''}`}
                          onClick={() => setSelectedLayerId(entry.id)}
                        >
                          <span className="cmp-layer-ic">
                            <LayerMiniIcon type={entry.type} />
                          </span>
                          <span className="cmp-layer-name">{entry.name}</span>
                          <span className={`cmp-diff-pill is-${entry.status}`}>
                            {entry.status === 'edited'
                              ? 'Edited'
                              : entry.status === 'added'
                                ? 'Added'
                                : 'Deleted'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>

            {/* CENTER: C. Side by side / D. Overlay Visual Stage */}
            <section className="cmp-stage" ref={stageRef}>
              {viewMode === 'side-by-side' ? (
                <div className="cmp-sbs-grid">
                  <div className="cmp-sbs-col">
                    <div className="cmp-col-head">
                      <strong>Previous version</strong>
                      <span>{activeSnapshot ? fmtHistoryDate(activeSnapshot.timestamp) : ''}</span>
                    </div>
                    <div className="cmp-frame-scroll">
                      <div
                        className="cmp-artboard-wrap"
                        style={{ width: frameW, height: frameH }}
                      >
                        {prevBundle && (
                          <ArtboardVectorView
                            bundle={prevBundle}
                            activeMode={activeMode}
                            scale={renderScale}
                          />
                        )}
                        {selectedEntry && renderHighlightBox(selectedEntry.before, selectedEntry.status)}
                      </div>
                    </div>
                  </div>

                  <div className="cmp-sbs-col">
                    <div className="cmp-col-head">
                      <strong>Current version</strong>
                      <span>Latest</span>
                    </div>
                    <div className="cmp-frame-scroll">
                      <div
                        className="cmp-artboard-wrap"
                        style={{ width: frameW, height: frameH }}
                      >
                        <ArtboardVectorView
                          bundle={bundle}
                          activeMode={activeMode}
                          scale={renderScale}
                        />
                        {selectedEntry && renderHighlightBox(selectedEntry.after, selectedEntry.status)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : viewMode === 'overlay' ? (
                <div className="cmp-overlay-wrap">
                  <div className="cmp-col-head">
                    <strong>Overlay</strong>
                    <span>Current ({showCurrentOverlay ? `${overlayOpacity}%` : 'hidden'}) over Previous</span>
                  </div>
                  <div className="cmp-frame-scroll">
                    <div
                      className="cmp-artboard-wrap"
                      style={{ width: frameW, height: frameH }}
                    >
                      {prevBundle && (
                        <div className="cmp-overlay-layer">
                          <ArtboardVectorView
                            bundle={prevBundle}
                            activeMode={activeMode}
                            scale={renderScale}
                          />
                        </div>
                      )}
                      {showCurrentOverlay && (
                        <div
                          className="cmp-overlay-layer"
                          style={{ opacity: overlayOpacity / 100 }}
                        >
                          <ArtboardVectorView
                            bundle={bundle}
                            activeMode={activeMode}
                            scale={renderScale}
                          />
                        </div>
                      )}
                      {selectedEntry &&
                        renderHighlightBox(selectedEntry.after || selectedEntry.before, selectedEntry.status)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="cmp-overlay-wrap">
                  <div className="cmp-col-head">
                    <strong>Split curtain</strong>
                    <span>Previous ({splitPct}%) ↔ Current ({100 - splitPct}%)</span>
                  </div>
                  <div className="cmp-frame-scroll">
                      <div
                      className="cmp-artboard-wrap cmp-split-stage"
                      style={{ width: frameW, height: frameH }}
                      onMouseDown={e => {
                        e.preventDefault();
                        const target = e.currentTarget;
                        const updatePct = (clientX: number) => {
                          const rect = target.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(100, Math.round(((clientX - rect.left) / rect.width) * 100)));
                          setSplitPct(pct);
                        };
                        updatePct(e.clientX);
                        const onMove = (ev: MouseEvent) => updatePct(ev.clientX);
                        const onUp = () => {
                          window.removeEventListener('mousemove', onMove);
                          window.removeEventListener('mouseup', onUp);
                        };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                      }}
                    >
                      {/* Right side: Current */}
                      <div className="cmp-overlay-layer">
                        <ArtboardVectorView
                          bundle={bundle}
                          activeMode={activeMode}
                          scale={renderScale}
                        />
                      </div>
                      {/* Left clipped curtain: Previous */}
                      {prevBundle && (
                        <div
                          className="cmp-overlay-layer"
                          style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                        >
                          <ArtboardVectorView
                            bundle={prevBundle}
                            activeMode={activeMode}
                            scale={renderScale}
                          />
                        </div>
                      )}
                      <div className="cmp-split-divider" style={{ left: `${splitPct}%` }}>
                        <span className="cmp-split-knob" />
                      </div>
                      {selectedEntry &&
                        renderHighlightBox(selectedEntry.after || selectedEntry.before, selectedEntry.status)}
                    </div>
                  </div>
                </div>
              )}

              {/* Floating Bottom Controls (exact Figma UI3 floating pills) */}
              <div className="cmp-stage-dock">
                <div className="cmp-float-pill">
                  <button
                    className={viewMode === 'side-by-side' ? 'active' : ''}
                    onClick={() => setViewMode('side-by-side')}
                  >
                    Side by side
                  </button>
                  <button
                    className={viewMode === 'overlay' ? 'active' : ''}
                    onClick={() => setViewMode('overlay')}
                  >
                    Overlay
                  </button>
                  <button
                    className={viewMode === 'split' ? 'active' : ''}
                    onClick={() => setViewMode('split')}
                  >
                    Split
                  </button>
                  {viewMode === 'overlay' && (
                    <div className="cmp-opacity-ctrl">
                      <button
                        className="cmp-icon-mini"
                        onClick={() => setShowCurrentOverlay(v => !v)}
                        title={showCurrentOverlay ? 'Hide current layer' : 'Show current layer'}
                      >
                        {showCurrentOverlay ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={overlayOpacity}
                        onChange={e => setOverlayOpacity(Number(e.target.value))}
                        aria-label="Overlay opacity"
                      />
                      <span className="mono">{overlayOpacity}%</span>
                    </div>
                  )}
                  {viewMode === 'split' && (
                    <div className="cmp-opacity-ctrl">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={splitPct}
                        onChange={e => setSplitPct(Number(e.target.value))}
                        aria-label="Split position"
                      />
                      <span className="mono">{splitPct}%</span>
                    </div>
                  )}
                </div>

                <div className="cmp-float-pill">
                  <button
                    className="cmp-icon-mini"
                    onClick={() => setZoomMul(z => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                    title="Zoom out"
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    className="cmp-zoom-fit"
                    onClick={() => setZoomMul(1)}
                    title="Reset zoom to fit"
                  >
                    {zoomMul === 1 ? 'Fit' : `${Math.round(zoomMul * 100)}%`}
                  </button>
                  <button
                    className="cmp-icon-mini"
                    onClick={() => setZoomMul(z => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
                    title="Zoom in"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </section>

            {/* RIGHT: E. Code Diff / F. Properties Diff */}
            <aside className="cmp-right">
              <div className="cmp-right-head">
                <div className="seg-inline">
                  <button
                    className={rightTab === 'code' ? 'active' : ''}
                    onClick={() => setRightTab('code')}
                  >
                    Code
                  </button>
                  <button
                    className={rightTab === 'properties' ? 'active' : ''}
                    onClick={() => setRightTab('properties')}
                  >
                    Properties
                  </button>
                </div>

                {rightTab === 'code' && (
                  <PopoverSelect<DiffCodeLang>
                    compact
                    align="right"
                    ariaLabel="Diff code language"
                    value={diffLang}
                    onChange={setDiffLang}
                    options={[
                      { value: 'css', label: 'CSS' },
                      { value: 'tailwind', label: 'Tailwind' },
                      { value: 'swiftui', label: 'SwiftUI' },
                      { value: 'compose', label: 'Compose' }
                    ]}
                  />
                )}
              </div>

              {selectedEntry && (
                <div className="cmp-selected-bar">
                  <span className="cmp-layer-ic">
                    <LayerMiniIcon type={selectedEntry.type} />
                  </span>
                  <span className="cmp-selected-name">{selectedEntry.name}</span>
                  {selectedEntry.status !== 'unchanged' && (
                    <span className={`cmp-diff-pill is-${selectedEntry.status}`}>
                      {selectedEntry.status === 'edited'
                        ? 'Edited'
                        : selectedEntry.status === 'added'
                          ? 'Added'
                          : 'Deleted'}
                    </span>
                  )}
                </div>
              )}

              <div className="cmp-right-scroll">
                {rightTab === 'code' ? (
                  <>
                    {/* Layout Code Card */}
                    <div className="cmp-code-card">
                      <div className="cmp-card-head">
                        <span>Layout</span>
                        <button
                          className="quiet-icon-btn"
                          onClick={() => copyCardLines('layout', codeCards.layout)}
                          title="Copy updated Layout code"
                        >
                          {copiedCard === 'layout' ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="cmp-diff-code">
                        {codeCards.layout.map((line, i) => (
                          <div key={`l-${i}`} className={`cmp-diff-line is-${line.kind}`}>
                            <span className="cmp-gutter">
                              {line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : ''}
                            </span>
                            <span className="cmp-line-text mono">
                              {line.swatch && (
                                <span
                                  className="cmp-inline-swatch"
                                  style={{ background: line.swatch }}
                                />
                              )}
                              {line.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Style Code Card */}
                    {codeCards.style.length > 0 && (
                      <div className="cmp-code-card">
                        <div className="cmp-card-head">
                          <span>Style</span>
                          <button
                            className="quiet-icon-btn"
                            onClick={() => copyCardLines('style', codeCards.style)}
                            title="Copy updated Style code"
                          >
                            {copiedCard === 'style' ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                        <div className="cmp-diff-code">
                          {codeCards.style.map((line, i) => (
                            <div key={`s-${i}`} className={`cmp-diff-line is-${line.kind}`}>
                              <span className="cmp-gutter">
                                {line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : ''}
                              </span>
                              <span className="cmp-line-text mono">
                                {line.swatch && (
                                  <span
                                    className="cmp-inline-swatch"
                                    style={{ background: line.swatch }}
                                  />
                                )}
                                {line.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="cmp-props-list">
                    {!selectedEntry || selectedEntry.changes.length === 0 ? (
                      <div className="cmp-no-diff">No property changes on this layer.</div>
                    ) : (
                      selectedEntry.changes.map((chg, idx) => (
                        <div key={idx} className="cmp-prop-card">
                          <div className="cmp-prop-name">{chg.property}</div>
                          {chg.before && (
                            <div className="cmp-prop-val is-before mono">
                              <span className="cmp-prop-sign">−</span>
                              {chg.beforeColor && (
                                <span
                                  className="cmp-inline-swatch"
                                  style={{ background: chg.beforeColor }}
                                />
                              )}
                              <span>{chg.before}</span>
                            </div>
                          )}
                          {chg.after && (
                            <div className="cmp-prop-val is-after mono">
                              <span className="cmp-prop-sign">+</span>
                              {chg.afterColor && (
                                <span
                                  className="cmp-inline-swatch"
                                  style={{ background: chg.afterColor }}
                                />
                              )}
                              <span>{chg.after}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
