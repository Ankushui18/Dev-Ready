import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ClipboardPaste, PanelLeftOpen, Upload, X } from 'lucide-react';
import type {
  CanvasMeasurement,
  CanvasViewMode,
  ChecklistItem,
  CodeConnectEntry,
  DevReadyBundle,
  DevResource,
  LayerAnnotation,
  ScreenStatus,
  UnitMode
} from './types';
import { DEMO_SCREENS } from './data/demoScreens';
import { findLayerById, findParentMap } from './lib/measure';
import { deleteScreen, loadSavedScreens, saveScreen } from './lib/storage';
import { decodeClipboardOrJson, decodeHashBundle, loadCloudShareLink } from './lib/transfer';
import { buildAiPrompt, buildMcpJson } from './lib/aiContext';
import { fmtMod } from './lib/platform';
import { InspectCanvas, type PadSide } from './components/InspectCanvas';
import { LeftSidebar } from './components/LeftSidebar';
import { RightInspector } from './components/RightInspector';
import { TransferModal } from './components/TransferModal';
import { ShareModal } from './components/ShareModal';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';
import { CompareChangesModal } from './components/CompareChangesModal';
import { VariablesTableModal } from './components/VariablesTableModal';
import { ReadyForDevFeed } from './components/ReadyForDevFeed';

export const App: React.FC = () => {
  const [screens, setScreens] = useState<DevReadyBundle[]>(DEMO_SCREENS);
  const [activeScreenId, setActiveScreenId] = useState<string>(DEMO_SCREENS[0].id);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(
    DEMO_SCREENS[0].root.children?.[2]?.children?.[0]?.id || DEMO_SCREENS[0].root.id
  );
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [highlightPadSide, setHighlightPadSide] = useState<PadSide>(null);
  const [unit, setUnit] = useState<UnitMode>('px');
  const [viewMode, setViewMode] = useState<CanvasViewMode>('inspect');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [zoom, setZoom] = useState(0.82);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [animateTransform, setAnimateTransform] = useState(false);
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(292);
  const [showRulers, setShowRulers] = useState(false);
  const [showOutlines, setShowOutlines] = useState(false);
  const [showPadding, setShowPadding] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [activeTokenMode, setActiveTokenMode] = useState<string>(DEMO_SCREENS[0].tokenModes?.[0] || '');
  const [hidePanels, setHidePanels] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [compareHistoryId, setCompareHistoryId] = useState<string | null>(null);
  const [showCompareChanges, setShowCompareChanges] = useState(false);
  const [showVarsTable, setShowVarsTable] = useState(false);
  const [initialVarName, setInitialVarName] = useState<string | undefined>(undefined);
  const [showReadyFeed, setShowReadyFeed] = useState(false);
  const [showCmdK, setShowCmdK] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSamplePill, setShowSamplePill] = useState(true);
  const [figmaBanner, setFigmaBanner] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const vpRef = useRef({ w: 1280, h: 800 });

  const activeScreen = useMemo(
    () => screens.find(s => s.id === activeScreenId) || screens[0],
    [screens, activeScreenId]
  );

  useEffect(() => {
    setActiveTokenMode(activeScreen.tokenModes?.[0] || '');
  }, [activeScreen.id, activeScreen.tokenModes]);

  const selectedLayer = useMemo(
    () => findLayerById(activeScreen.root, selectedLayerId) || activeScreen.root,
    [activeScreen.root, selectedLayerId]
  );

  const parentMap = useMemo(() => findParentMap(activeScreen.root), [activeScreen.root]);

  const notify = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const triggerSmoothView = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
    setAnimateTransform(true);
    setZoom(nextZoom);
    setPan(nextPan);
    setTimeout(() => setAnimateTransform(false), 260);
  }, []);

  const fitToScreen = useCallback(
    (bundle?: DevReadyBundle) => {
      const target = bundle || activeScreen;
      const sideAllowance = hidePanels ? 100 : leftWidth + rightWidth + 72;
      const availW = Math.max(320, vpRef.current.w - sideAllowance);
      const availH = Math.max(260, vpRef.current.h - 150);
      const next = Math.max(0.25, Math.min(1, Math.min(availW / target.width, availH / target.height)));
      const offsetX = hidePanels ? 0 : (leftWidth - rightWidth) / 2;
      triggerSmoothView(Math.round(next * 100) / 100, { x: offsetX, y: -10 });
    },
    [activeScreen, hidePanels, leftWidth, rightWidth, triggerSmoothView]
  );

  // Smooth Figma Shift+2 "Zoom to Selection"
  const zoomToSelection = useCallback(() => {
    const l = selectedLayer;
    const sideAllowance = hidePanels ? 120 : leftWidth + rightWidth + 100;
    const availW = Math.max(260, vpRef.current.w - sideAllowance);
    const availH = Math.max(220, vpRef.current.h - 180);
    const nextZoom = Math.max(0.4, Math.min(2.4, Math.min(availW / Math.max(l.width, 40), availH / Math.max(l.height, 40)) * 0.65));
    const rounded = Math.round(nextZoom * 100) / 100;
    const cx = l.x + l.width / 2 - activeScreen.width / 2;
    const cy = l.y + l.height / 2 - activeScreen.height / 2;
    const offsetX = hidePanels ? 0 : (leftWidth - rightWidth) / 2;
    triggerSmoothView(rounded, { x: offsetX - cx * rounded, y: -cy * rounded });
  }, [selectedLayer, activeScreen.width, activeScreen.height, hidePanels, leftWidth, rightWidth, triggerSmoothView]);

  useEffect(() => {
    fitToScreen(activeScreen);
  }, [activeScreen.id, hidePanels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Full Figma Keyboard Muscle Memory
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowCmdK(v => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setHidePanels(v => !v);
        return;
      }
      if (e.metaKey || e.ctrlKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(v => !v);
      } else if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showImport) { setShowImport(false); return; }
        if (showShare) { setShowShare(false); return; }
        if (showCompareChanges) { setShowCompareChanges(false); return; }
        if (showVarsTable) { setShowVarsTable(false); return; }
        if (showReadyFeed) { setShowReadyFeed(false); return; }
        if (showCmdK) { setShowCmdK(false); return; }
        // Step UP to parent layer just like Figma!
        const parent = parentMap.get(selectedLayer.id);
        if (parent) setSelectedLayerId(parent.id);
        return;
      }

      // Do not hijack Tab / Enter / canvas shortcuts while a modal or Ready for dev hub is open
      if (
        showShortcuts ||
        showImport ||
        showShare ||
        showCompareChanges ||
        showVarsTable ||
        showReadyFeed ||
        showCmdK
      ) {
        return;
      }

      const isInteractiveFocus =
        e.target instanceof HTMLButtonElement ||
        e.target instanceof HTMLAnchorElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      if (e.key === 'Enter' && e.shiftKey) {
        if (isInteractiveFocus) return;
        // Step UP to parent layer just like Figma!
        e.preventDefault();
        const parent = parentMap.get(selectedLayer.id);
        if (parent) setSelectedLayerId(parent.id);
      } else if (e.key === 'Enter' && selectedLayer.children?.length) {
        if (isInteractiveFocus) return;
        // Step DOWN into first child layer just like Figma!
        e.preventDefault();
        setSelectedLayerId(selectedLayer.children[0].id);
      } else if (e.key === 'Tab') {
        if (isInteractiveFocus) return;
        // Cycle sibling layers just like Figma!
        const parent = parentMap.get(selectedLayer.id);
        if (parent?.children && parent.children.length > 1) {
          e.preventDefault();
          const idx = parent.children.findIndex(c => c.id === selectedLayer.id);
          const nextIdx = e.shiftKey
            ? (idx - 1 + parent.children.length) % parent.children.length
            : (idx + 1) % parent.children.length;
          setSelectedLayerId(parent.children[nextIdx].id);
        }
      } else if (e.key === '=' || e.key === '+') {
        setZoom(z => Math.min(8, Math.round((z + 0.25) * 100) / 100));
      } else if (e.key === '-') {
        setZoom(z => Math.max(0.2, Math.round((z - 0.15) * 100) / 100));
      } else if (e.key === '0') {
        fitToScreen();
      } else if (e.key === '1') {
        triggerSmoothView(1, { x: hidePanels ? 0 : (leftWidth - rightWidth) / 2, y: 0 });
      } else if (e.shiftKey && (e.key === '@' || e.code === 'Digit2')) {
        e.preventDefault();
        zoomToSelection();
      } else if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        setShowRulers(v => !v);
      } else if (e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        setShowOutlines(v => !v);
      } else if (!e.shiftKey && !e.metaKey && !e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        setShowAnnotations(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    parentMap,
    selectedLayer,
    showShortcuts,
    showImport,
    showShare,
    showCompareChanges,
    showVarsTable,
    showReadyFeed,
    showCmdK,
    fitToScreen,
    zoomToSelection,
    triggerSmoothView,
    hidePanels,
    leftWidth,
    rightWidth
  ]);

  const upsertScreen = useCallback(async (bundle: DevReadyBundle, announce?: string) => {
    let nextBundle = bundle;
    setScreens(prev => {
      const existing = prev.find(s => s.id === bundle.id);
      if (existing) {
        // Archive previous root as a comparable snapshot automatically on re-import
        const prevEntry = {
          id: `h-snap-${Date.now()}`,
          summary: `Previous snapshot before re-import`,
          status: existing.status,
          timestamp: existing.updatedAt,
          rootSnapshot: existing.root
        };
        const mergedHistory = [
          {
            id: `h-cur-${Date.now()}`,
            summary: `Updated "${bundle.name}" from ${bundle.source}`,
            status: bundle.status,
            timestamp: bundle.updatedAt,
            rootSnapshot: bundle.root
          },
          prevEntry,
          ...(existing.history || [])
        ].slice(0, 12);
        nextBundle = { ...bundle, history: bundle.history?.length ? bundle.history : mergedHistory };
        return prev.map(s => (s.id === bundle.id ? nextBundle : s));
      }
      return [bundle, ...prev];
    });
    await saveScreen(nextBundle);
    setActiveScreenId(nextBundle.id);
    setSelectedLayerId(nextBundle.root.id);
    setHoveredLayerId(null);
    if (nextBundle.source !== 'demo') setShowSamplePill(false);
    if (announce) notify(announce);
  }, [notify]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadSavedScreens();
      if (!alive) return;
      if (saved.length > 0) {
        const merged = saved.map(sc => {
          const demoMatch = DEMO_SCREENS.find(d => d.id === sc.id);
          if (!demoMatch) return sc;
          const hasSnapshots = sc.history?.some(h => Boolean(h.rootSnapshot));
          return {
            ...sc,
            annotations: sc.annotations === undefined ? demoMatch.annotations : sc.annotations,
            devResources: sc.devResources === undefined ? demoMatch.devResources : sc.devResources,
            codeConnect: sc.codeConnect === undefined ? demoMatch.codeConnect : sc.codeConnect,
            history: !hasSnapshots ? demoMatch.history : sc.history
          };
        });
        for (const demo of DEMO_SCREENS) {
          if (!merged.some(s => s.id === demo.id)) merged.push(demo);
        }
        setScreens(merged);
      }

      const url = new URL(window.location.href);
      const pathMatch = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{4,32})$/);
      const shareId = url.searchParams.get('s') || (pathMatch ? pathMatch[1] : null);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const key = hashParams.get('k') || undefined;
      const inlineBundle = hashParams.get('b');

      if (url.searchParams.get('from') === 'figma') {
        setFigmaBanner(true);
        setShowSamplePill(false);
      }

      if (shareId) {
        setLoadingCloud(true);
        setShowSamplePill(false);
        try {
          const loaded = await loadCloudShareLink(shareId, key);
          if (!alive) return;
          await upsertScreen(loaded, `Loaded "${loaded.name}"`);
        } catch (err) {
          if (alive) notify(err instanceof Error ? err.message : 'Failed to load shared screen');
        } finally {
          if (alive) setLoadingCloud(false);
        }
      } else if (inlineBundle) {
        setShowSamplePill(false);
        try {
          const loaded = await decodeHashBundle(inlineBundle);
          if (!alive) return;
          await upsertScreen(loaded, `Imported "${loaded.name}"`);
        } catch {
          if (alive) notify('Invalid bundle in URL');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [upsertScreen, notify]);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      if (text.trim().startsWith('DEVREADY1:') || text.trim().startsWith('{')) {
        try {
          const bundle = await decodeClipboardOrJson(text);
          setFigmaBanner(false);
          await upsertScreen(bundle, `Transferred "${bundle.name}" from Figma`);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [upsertScreen]);

  const handleSelectScreen = (id: string) => {
    const target = screens.find(s => s.id === id);
    if (!target) return;
    setActiveScreenId(id);
    setSelectedLayerId(target.root.id);
    setHoveredLayerId(null);
    setShowReadyFeed(false);
  };

  const handleSelectLayer = useCallback((id: string) => {
    setSelectedLayerId(id);
    setShowReadyFeed(false);
  }, []);

  const handleStatusChange = async (id: string, status: ScreenStatus) => {
    const target = screens.find(s => s.id === id);
    if (!target || target.status === status) return;
    const statusLabel = status === 'ready' ? 'Ready for dev' : status === 'in-progress' ? 'In progress' : 'Completed';
    const now = new Date().toISOString();
    const entry = {
      id: `h-${Date.now()}`,
      summary: `Status changed to ${statusLabel}`,
      status,
      timestamp: now
    };
    const updated: DevReadyBundle = {
      ...target,
      status,
      updatedAt: now,
      history: [entry, ...(target.history || [])].slice(0, 20)
    };
    await saveScreen(updated);
    setScreens(prev => prev.map(s => (s.id === id ? updated : s)));
  };

  const handleChecklistChange = async (items: ChecklistItem[]) => {
    const updated: DevReadyBundle = { ...activeScreen, checklist: items, updatedAt: new Date().toISOString() };
    await saveScreen(updated);
    setScreens(prev => prev.map(s => (s.id === activeScreen.id ? updated : s)));
  };

  const handleAnnotationsChange = async (annotations: LayerAnnotation[]) => {
    const updated: DevReadyBundle = { ...activeScreen, annotations, updatedAt: new Date().toISOString() };
    await saveScreen(updated);
    setScreens(prev => prev.map(s => (s.id === activeScreen.id ? updated : s)));
  };

  const handleMeasurementsChange = async (measurements: CanvasMeasurement[]) => {
    const updated: DevReadyBundle = { ...activeScreen, measurements, updatedAt: new Date().toISOString() };
    await saveScreen(updated);
    setScreens(prev => prev.map(s => (s.id === activeScreen.id ? updated : s)));
  };

  const handleDevResourcesChange = async (devResources: DevResource[]) => {
    const updated: DevReadyBundle = { ...activeScreen, devResources, updatedAt: new Date().toISOString() };
    await saveScreen(updated);
    setScreens(prev => prev.map(s => (s.id === activeScreen.id ? updated : s)));
  };

  const handleCodeConnectChange = async (codeConnect: Record<string, CodeConnectEntry>) => {
    const now = new Date().toISOString();
    const entry = {
      id: `h-${Date.now()}`,
      summary: `Updated Code Connect mappings (${Object.keys(codeConnect).length})`,
      timestamp: now
    };
    const updated: DevReadyBundle = {
      ...activeScreen,
      codeConnect,
      updatedAt: now,
      history: [entry, ...(activeScreen.history || [])].slice(0, 20)
    };
    await saveScreen(updated);
    setScreens(prev => prev.map(s => (s.id === activeScreen.id ? updated : s)));
  };

  const handleDeleteScreen = async (id: string) => {
    await deleteScreen(id);
    setScreens(prev => {
      const next = prev.filter(s => s.id !== id);
      if (id === activeScreenId && next[0]) {
        setActiveScreenId(next[0].id);
        setSelectedLayerId(next[0].root.id);
      }
      return next;
    });
    notify('Removed screen');
  };

  const handleQuickPasteBanner = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      const bundle = await decodeClipboardOrJson(txt);
      setFigmaBanner(false);
      await upsertScreen(bundle, `Transferred "${bundle.name}" from Figma`);
    } catch {
      setShowImport(true);
    }
  };

  const handleDropFile = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const bundle = await decodeClipboardOrJson(txt);
      await upsertScreen(bundle, `Imported "${bundle.name}"`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Not a valid .devready.json file');
    }
  };

  const handleViewportResize = useCallback((size: { w: number; h: number }) => {
    vpRef.current = size;
  }, []);

  return (
    <div
      className="ui3-stage"
      onDragOver={e => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDraggingFile(true);
        }
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setIsDraggingFile(false);
      }}
      onDrop={handleDropFile}
    >
      <InspectCanvas
        bundle={activeScreen}
        selectedId={selectedLayer.id}
        hoveredId={hoveredLayerId}
        highlightPadSide={highlightPadSide}
        unit={unit}
        viewMode={viewMode}
        zoom={zoom}
        pan={pan}
        animateTransform={animateTransform}
        showRulers={showRulers}
        showOutlines={showOutlines}
        showPadding={showPadding}
        showAnnotations={showAnnotations}
        rulerOffsetLeft={hidePanels ? 0 : leftWidth + 20}
        rulerOffsetRight={hidePanels ? 0 : rightWidth + 20}
        activeMode={activeTokenMode}
        onModeChange={setActiveTokenMode}
        onZoomChange={setZoom}
        onPanChange={setPan}
        onViewModeChange={setViewMode}
        onToggleAnnotations={() => setShowAnnotations(v => !v)}
        onAnnotationsChange={handleAnnotationsChange}
        onMeasurementsChange={handleMeasurementsChange}
        onStatusChange={status => handleStatusChange(activeScreen.id, status)}
        onNotify={notify}
        onViewportResize={handleViewportResize}
        onSelect={setSelectedLayerId}
        onHover={setHoveredLayerId}
      />

      {/* Quiet Non-Blocking Sample File Pill (hidden automatically when a real Figma file is loaded or in Preview/Compare mode) */}
      {!showReadyFeed && viewMode === 'inspect' && showSamplePill && !figmaBanner && activeScreen.source === 'demo' && !hidePanels && (
        <div className="sample-onboarding-pill">
          <span className="sample-dot" />
          <span>Sample Figma file · Hover any layer to measure</span>
          <button className="sample-cta" onClick={() => setShowImport(true)}>
            <span>Import your Figma file</span>
            <ArrowRight size={11} />
          </button>
          <button className="sample-close" onClick={() => setShowSamplePill(false)} aria-label="Dismiss">
            <X size={11} />
          </button>
        </div>
      )}

      {!hidePanels ? (
        <LeftSidebar
          width={leftWidth}
          screens={screens}
          activeScreen={activeScreen}
          selectedId={selectedLayer.id}
          hoveredId={hoveredLayerId}
          unit={unit}
          theme={theme}
          showReadyFeed={showReadyFeed}
          onToggleReadyFeed={() => setShowReadyFeed(v => !v)}
          onResizeWidth={setLeftWidth}
          onUnitChange={setUnit}
          onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          onCollapse={() => setHidePanels(true)}
          onOpenCmdK={() => setShowCmdK(true)}
          onOpenShortcuts={() => setShowShortcuts(true)}
          onSelectLayer={handleSelectLayer}
          onHoverLayer={setHoveredLayerId}
          onSelectScreen={handleSelectScreen}
          onStatusChange={handleStatusChange}
          onDeleteScreen={handleDeleteScreen}
          onOpenImport={() => setShowImport(true)}
        />
      ) : (
        <button
          className="floating-restore-btn"
          onClick={() => setHidePanels(false)}
          title={`Show UI (${fmtMod('\\')})`}
        >
          <PanelLeftOpen size={15} />
        </button>
      )}

      {showReadyFeed ? (
        <ReadyForDevFeed
          screens={screens}
          leftOffset={hidePanels ? 54 : leftWidth + 24}
          onInspectScreen={handleSelectScreen}
          onStatusChange={handleStatusChange}
          onCompareScreen={id => {
            handleSelectScreen(id);
            setCompareHistoryId(null);
            setShowCompareChanges(true);
          }}
          onOpenImport={() => setShowImport(true)}
          onClose={() => setShowReadyFeed(false)}
        />
      ) : (
        !hidePanels && (
          <RightInspector
            width={rightWidth}
            bundle={activeScreen}
            layer={selectedLayer}
            unit={unit}
            zoom={zoom}
            showRulers={showRulers}
            showOutlines={showOutlines}
            showPadding={showPadding}
            activeMode={activeTokenMode}
            onModeChange={setActiveTokenMode}
            onResizeWidth={setRightWidth}
            onHoverPadSide={setHighlightPadSide}
            onZoomChange={setZoom}
            onFitToScreen={() => fitToScreen()}
            onZoomToSelection={zoomToSelection}
            onToggleRulers={() => setShowRulers(v => !v)}
            onToggleOutlines={() => setShowOutlines(v => !v)}
            onTogglePadding={() => setShowPadding(v => !v)}
            onStatusChange={st => handleStatusChange(activeScreen.id, st)}
            onChecklistChange={handleChecklistChange}
            onAnnotationsChange={handleAnnotationsChange}
            onDevResourcesChange={handleDevResourcesChange}
            onCodeConnectChange={handleCodeConnectChange}
            onOpenImport={() => setShowImport(true)}
            onOpenShare={() => setShowShare(true)}
            onOpenCompareChanges={histId => {
              setCompareHistoryId(histId || null);
              setShowCompareChanges(true);
            }}
            onOpenVariablesTable={tokenName => {
              setInitialVarName(tokenName);
              setShowVarsTable(true);
            }}
            onSelectLayer={setSelectedLayerId}
            onNotify={notify}
          />
        )
      )}

      {figmaBanner && (
        <div className="floating-paste-pill">
          <ClipboardPaste size={13} />
          <span>Ready from Figma — press <kbd>{fmtMod('V')}</kbd></span>
          <button className="btn-figma-blue" onClick={handleQuickPasteBanner}>
            Paste
          </button>
          <button className="text-action" onClick={() => setFigmaBanner(false)}>
            Dismiss
          </button>
        </div>
      )}

      {isDraggingFile && (
        <div className="global-drop-overlay">
          <div className="drop-card">
            <Upload size={24} />
            <strong>Drop .devready.json to inspect</strong>
          </div>
        </div>
      )}

      {loadingCloud && (
        <div className="global-drop-overlay">
          <div className="drop-card">
            <strong>Decrypting shared Figma screen…</strong>
          </div>
        </div>
      )}

      {showImport && (
        <TransferModal
          onClose={() => setShowImport(false)}
          onImport={b => upsertScreen(b, `Imported "${b.name}"`)}
        />
      )}
      {showShare && (
        <ShareModal
          bundle={activeScreen}
          onClose={() => setShowShare(false)}
          onNotify={notify}
        />
      )}
      {showCmdK && (
        <CommandPalette
          screens={screens}
          activeScreen={activeScreen}
          theme={theme}
          onClose={() => setShowCmdK(false)}
          onSelectLayer={handleSelectLayer}
          onSelectScreen={handleSelectScreen}
          onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          onToggleRulers={() => setShowRulers(v => !v)}
          onOpenImport={() => setShowImport(true)}
          onOpenShare={() => setShowShare(true)}
          onOpenCompareChanges={() => {
            setCompareHistoryId(null);
            setShowCompareChanges(true);
          }}
          onOpenVariablesTable={() => {
            setInitialVarName(undefined);
            setShowVarsTable(true);
          }}
          onOpenReadyFeed={() => setShowReadyFeed(true)}
          onCopyAiPrompt={async () => {
            const text = buildAiPrompt(activeScreen, selectedLayer, unit, 'react-tailwind-ts', 'layer');
            await navigator.clipboard.writeText(text).catch(() => {});
            notify(`Copied AI prompt for "${selectedLayer.name}"`);
          }}
          onCopyMcpJson={async () => {
            const text = buildMcpJson(activeScreen, selectedLayer, unit, 'layer');
            await navigator.clipboard.writeText(text).catch(() => {});
            notify(`Copied MCP JSON for "${selectedLayer.name}"`);
          }}
        />
      )}
      {showCompareChanges && (
        <CompareChangesModal
          bundle={activeScreen}
          unit={unit}
          activeMode={activeTokenMode}
          initialHistoryId={compareHistoryId || undefined}
          initialLayerId={selectedLayer.id}
          onClose={() => setShowCompareChanges(false)}
          onNotify={notify}
        />
      )}
      {showVarsTable && (
        <VariablesTableModal
          bundle={activeScreen}
          activeMode={activeTokenMode}
          initialTarget="css"
          initialTokenName={initialVarName}
          onModeChange={setActiveTokenMode}
          onSelectLayer={layerId => {
            handleSelectLayer(layerId);
            setShowVarsTable(false);
          }}
          onClose={() => setShowVarsTable(false)}
          onNotify={notify}
        />
      )}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {toast && <div className="studio-toast">{toast}</div>}
    </div>
  );
};
