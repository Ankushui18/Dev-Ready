import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Diamond,
  Eye,
  FileCode2,
  Hand,
  MessageSquarePlus,
  MessageSquareText,
  MousePointer2,
  Pin,
  Ruler,
  Smartphone,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  X
} from 'lucide-react';
import type {
  AnnotationCategory,
  CanvasMeasurement,
  CanvasViewMode,
  DevReadyBundle,
  InspectLayer,
  LayerAnnotation,
  ScreenStatus,
  UnitMode
} from '../types';
import {
  computeGapOverlays,
  computeMeasurements,
  computePaddingOverlays,
  findLayerById,
  findParentMap,
  flattenLayers,
  formatRadius,
  formatUnit,
  getLayerBreadcrumbs,
  hitTestLayerSmart
} from '../lib/measure';
import { layerToCssMap, layerToTailwind } from '../lib/codegen';
import { buildAiPrompt } from '../lib/aiContext';
import { runDesignLint, type LintCategory } from '../lib/lint';
import { CanvasRulers } from './CanvasRulers';
import { ArtboardVectorView } from './ArtboardVectorView';
import { PopoverSelect } from './PopoverSelect';

export type PadSide = 'top' | 'right' | 'bottom' | 'left' | 'gap' | null;
type PreviewBackdrop = 'canvas' | 'dark' | 'light' | 'checker';
type CompareStyle = 'split' | 'overlay';
type CanvasTool = 'select' | 'measure' | 'annotate' | 'hand';
type VisionMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'grayscale';

const LINT_COLORS: Record<LintCategory, string> = {
  a11y: '#F24822',
  token: '#F59E0B',
  grid: '#A259FF'
};

interface InspectCanvasProps {
  bundle: DevReadyBundle;
  selectedId: string;
  hoveredId: string | null;
  highlightPadSide: PadSide;
  unit: UnitMode;
  viewMode: CanvasViewMode;
  zoom: number;
  pan: { x: number; y: number };
  animateTransform: boolean;
  showRulers: boolean;
  showOutlines: boolean;
  showPadding: boolean;
  showAnnotations: boolean;
  rulerOffsetLeft?: number;
  rulerOffsetRight?: number;
  activeMode: string;
  onModeChange: (mode: string) => void;
  onZoomChange: (z: number) => void;
  onPanChange: (p: { x: number; y: number }) => void;
  onViewModeChange: (mode: CanvasViewMode) => void;
  onToggleAnnotations: () => void;
  onAnnotationsChange: (items: LayerAnnotation[]) => void;
  onMeasurementsChange: (items: CanvasMeasurement[]) => void;
  onStatusChange: (status: ScreenStatus) => void;
  onNotify: (msg: string) => void;
  onViewportResize: (size: { w: number; h: number }) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

const ANN_META: Record<AnnotationCategory, { label: string; color: string }> = {
  dev: { label: 'Dev', color: '#0D99FF' },
  a11y: { label: 'A11y', color: '#A259FF' },
  interaction: { label: 'Interaction', color: '#14AE5C' },
  content: { label: 'Content', color: '#F59E0B' }
};

export const InspectCanvas: React.FC<InspectCanvasProps> = ({
  bundle,
  selectedId,
  hoveredId,
  highlightPadSide,
  unit,
  viewMode,
  zoom,
  pan,
  animateTransform,
  showRulers,
  showOutlines,
  showPadding,
  showAnnotations,
  rulerOffsetLeft = 0,
  rulerOffsetRight = 0,
  activeMode,
  onModeChange,
  onZoomChange,
  onPanChange,
  onViewModeChange,
  onToggleAnnotations,
  onAnnotationsChange,
  onMeasurementsChange,
  onStatusChange,
  onNotify,
  onViewportResize,
  onSelect,
  onHover
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [vpSize, setVpSize] = useState({ w: 1200, h: 800 });
  const [tool, setTool] = useState<CanvasTool>('select');
  const [isPanning, setIsPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [altDown, setAltDown] = useState(false);
  const [modDown, setModDown] = useState(false);
  const [measureFromId, setMeasureFromId] = useState<string | null>(null);
  const [measureDragging, setMeasureDragging] = useState(false);
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; layer: InspectLayer } | null>(null);
  const [annDraft, setAnnDraft] = useState<{
    x: number;
    y: number;
    layer: InspectLayer;
    category: AnnotationCategory;
    text: string;
  } | null>(null);
  const [compareStyle, setCompareStyle] = useState<CompareStyle>('split');
  const [splitPct, setSplitPct] = useState(50);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [diffOpacity, setDiffOpacity] = useState(0.55);
  const [previewBackdrop, setPreviewBackdrop] = useState<PreviewBackdrop>('canvas');
  const [deviceFrame, setDeviceFrame] = useState(false);
  const [breakpointWidth, setBreakpointWidth] = useState<number | null>(null);
  const [visionMode, setVisionMode] = useState<VisionMode>('normal');
  const [lockedCompareId, setLockedCompareId] = useState<string | null>(null);
  const [showLint, setShowLint] = useState(false);
  const [lintFilter, setLintFilter] = useState<'all' | LintCategory>('all');
  const [cursorArtboard, setCursorArtboard] = useState<{ x: number; y: number } | null>(null);
  const [canvasDeselected, setCanvasDeselected] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const didPanRef = useRef(false);
  const wheelStateRef = useRef({ zoom, pan, onZoomChange, onPanChange });
  wheelStateRef.current = { zoom, pan, onZoomChange, onPanChange };

  const isMobileFrame = bundle.width <= 460 && bundle.height >= 640;

  // Whenever a layer is selected from sidebar or keyboard, restore active canvas highlight
  useEffect(() => {
    setCanvasDeselected(false);
  }, [selectedId, bundle.id]);

  // Resolve outer artboard frame background for live Variable Mode (Light/Dark) switching
  const effectiveRootBg = useMemo(() => {
    if (activeMode && bundle.tokens.length > 0) {
      const rootFill = bundle.root.fills?.[0];
      if (rootFill?.token) {
        const clean = rootFill.token.replace(/^--/, '').toLowerCase();
        const hit = bundle.tokens.find(t => t.name.replace(/^--/, '').toLowerCase() === clean);
        if (hit?.modes?.[activeMode]) return hit.modes[activeMode];
      }
      const bgLower = (bundle.backgroundColor || '').toLowerCase();
      const byVal = bundle.tokens.find(
        t => t.category === 'color' && t.value.toLowerCase() === bgLower && t.modes?.[activeMode]
      );
      if (byVal?.modes?.[activeMode]) return byVal.modes[activeMode];
    }
    return bundle.backgroundColor;
  }, [activeMode, bundle.tokens, bundle.root.fills, bundle.backgroundColor]);

  useEffect(() => {
    setDeviceFrame(isMobileFrame);
    setBreakpointWidth(null);
    setVisionMode('normal');
    setMeasureFromId(null);
    setLockedCompareId(null);
    setSelectedMeasureId(null);
    setCtxMenu(null);
    setAnnDraft(null);
  }, [bundle.id, isMobileFrame]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setVpSize({ w: r.width, h: r.height });
      onViewportResize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onViewportResize]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltDown(true);
      if (e.key === 'Meta' || e.key === 'Control') setModDown(true);
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpaceDown(true);
      } else if (e.key === 'v' || e.key === 'V') {
        setTool('select');
        setMeasureFromId(null);
      } else if (e.key === 'h' || e.key === 'H') {
        setTool('hand');
        setMeasureFromId(null);
      } else if (e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        onViewModeChange('inspect');
        setTool(t => (t === 'measure' ? 'select' : 'measure'));
        setMeasureFromId(null);
      } else if (e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        onViewModeChange('inspect');
        setTool(t => (t === 'annotate' ? 'select' : 'annotate'));
        setMeasureFromId(null);
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedMeasureId) {
        e.preventDefault();
        const next = (bundle.measurements || []).filter(m => m.id !== selectedMeasureId);
        onMeasurementsChange(next);
        setSelectedMeasureId(null);
        onNotify('Removed pinned measurement');
      } else if (e.key === 'Escape') {
        if (ctxMenu) { setCtxMenu(null); return; }
        if (annDraft) { setAnnDraft(null); return; }
        if (lockedCompareId) { setLockedCompareId(null); return; }
        if (measureFromId) { setMeasureFromId(null); return; }
        if (selectedMeasureId) { setSelectedMeasureId(null); return; }
        if (tool !== 'select') { setTool('select'); return; }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
      if (e.key === 'Alt') setAltDown(false);
      if (e.key === 'Meta' || e.key === 'Control') setModDown(false);
    };
    const onBlur = () => {
      setAltDown(false);
      setModDown(false);
      setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [bundle.measurements, ctxMenu, annDraft, lockedCompareId, measureFromId, selectedMeasureId, tool, onMeasurementsChange, onNotify, onViewModeChange]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = () => setCtxMenu(null);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [ctxMenu]);

  // Drag handler for Split-Curtain Compare slider
  useEffect(() => {
    if (!draggingSplit) return;
    const onMove = (e: MouseEvent) => {
      const el = frameRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.max(4, Math.min(96, Math.round(pct * 10) / 10)));
    };
    const onUp = () => setDraggingSplit(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingSplit]);

  const selectedLayer = useMemo(() => findLayerById(bundle.root, selectedId) || bundle.root, [bundle.root, selectedId]);
  const hoveredLayer = useMemo(() => (hoveredId ? findLayerById(bundle.root, hoveredId) : null), [bundle.root, hoveredId]);
  const parentMap = useMemo(() => findParentMap(bundle.root), [bundle.root]);
  const breadcrumbs = useMemo(() => getLayerBreadcrumbs(bundle.root, selectedLayer.id), [bundle.root, selectedLayer.id]);
  const allLayersFlat = useMemo(() => flattenLayers(bundle.root), [bundle.root]);

  const effectivePreviewWidth = viewMode === 'preview' && breakpointWidth ? breakpointWidth : bundle.width;
  const previewScaleX = effectivePreviewWidth / bundle.width;
  const effectivePreviewHeight = viewMode === 'preview' && breakpointWidth
    ? Math.round(bundle.height * previewScaleX)
    : bundle.height;

  const measureFromLayer = useMemo(
    () => (measureFromId ? findLayerById(bundle.root, measureFromId) : null),
    [bundle.root, measureFromId]
  );

  const lockedCompareLayer = useMemo(
    () => (lockedCompareId ? findLayerById(bundle.root, lockedCompareId) : null),
    [bundle.root, lockedCompareId]
  );

  const lintReport = useMemo(() => runDesignLint(bundle), [bundle]);
  const visibleLintIssues = useMemo(
    () =>
      showLint && viewMode === 'inspect'
        ? lintFilter === 'all'
          ? lintReport.issues
          : lintReport.issues.filter(i => i.category === lintFilter)
        : [],
    [showLint, viewMode, lintFilter, lintReport.issues]
  );

  const isRootSelected = selectedLayer.id === bundle.root.id;

  const redlines = useMemo(() => {
    if (viewMode !== 'inspect') return [];
    // Active Measure tool preview from anchor layer -> hovered layer
    if (tool === 'measure' && measureFromLayer && hoveredLayer && hoveredLayer.id !== measureFromLayer.id) {
      return computeMeasurements(measureFromLayer, hoveredLayer);
    }
    if (canvasDeselected) return [];
    // Shift+Click 2-layer distance lock stays visible even when cursor moves away!
    if (lockedCompareLayer && lockedCompareLayer.id !== selectedLayer.id) {
      return computeMeasurements(selectedLayer, lockedCompareLayer);
    }
    // Authentic Figma Dev Mode rule: when the full root artboard is selected,
    // do NOT spam redlines to inner cards on plain hover (only on explicit Alt/Option hold).
    if (isRootSelected) {
      if (altDown && hoveredLayer && hoveredLayer.id !== selectedLayer.id) {
        return computeMeasurements(selectedLayer, hoveredLayer);
      }
      return [];
    }
    if (hoveredLayer && hoveredLayer.id !== selectedLayer.id) {
      return computeMeasurements(selectedLayer, hoveredLayer);
    }
    const parent = parentMap.get(selectedLayer.id);
    if (parent && (altDown || hoveredLayer?.id === parent.id)) {
      return computeMeasurements(selectedLayer, parent);
    }
    return [];
  }, [viewMode, tool, measureFromLayer, lockedCompareLayer, canvasDeselected, isRootSelected, selectedLayer, hoveredLayer, parentMap, altDown]);

  // Authentic Figma Dev Mode Auto-Layout Padding & Gap:
  // When empty canvas is clicked (canvasDeselected) or root is selected, keep the canvas completely calm.
  const autoLayoutTarget = useMemo(() => {
    if (viewMode !== 'inspect') return null;
    if (showPadding || highlightPadSide) return selectedLayer;
    if (canvasDeselected) return null;
    if (isRootSelected) {
      if (altDown && hoveredLayer?.autoLayout) return hoveredLayer;
      return selectedLayer.autoLayout ? selectedLayer : null;
    }
    if (hoveredLayer?.autoLayout) return hoveredLayer;
    if (selectedLayer.autoLayout && hoveredLayer && findLayerById(selectedLayer, hoveredLayer.id)) {
      return selectedLayer;
    }
    if (hoveredLayer) {
      const p = parentMap.get(hoveredLayer.id);
      if (p?.autoLayout && (p.id === selectedLayer.id || altDown)) return p;
    }
    return null;
  }, [viewMode, showPadding, highlightPadSide, canvasDeselected, isRootSelected, selectedLayer, hoveredLayer, parentMap, altDown]);

  const paddingOverlays = useMemo(() => {
    if (!autoLayoutTarget) return [];
    return computePaddingOverlays(autoLayoutTarget);
  }, [autoLayoutTarget]);

  const gapOverlays = useMemo(() => {
    if (!autoLayoutTarget || (highlightPadSide && highlightPadSide !== 'gap')) return [];
    return computeGapOverlays(autoLayoutTarget);
  }, [autoLayoutTarget, highlightPadSide]);

  const allOutlines = useMemo(() => {
    if (!showOutlines) return [];
    return allLayersFlat;
  }, [showOutlines, allLayersFlat]);

  const resolvedAnnotations = useMemo(() => {
    const list = bundle.annotations || [];
    if (!showAnnotations || viewMode !== 'inspect' || list.length === 0) return [];
    return list
      .map(ann => {
        const target = findLayerById(bundle.root, ann.layerId);
        return target ? { ann, target } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [bundle.annotations, bundle.root, showAnnotations, viewMode]);

  const annCount = (bundle.annotations || []).length;

  const panModeActive = tool === 'hand' || spaceDown || isPanning;
  const stageW = effectivePreviewWidth * zoom;
  const stageH = effectivePreviewHeight * zoom;
  const boardLeft = vpSize.w / 2 + pan.x - stageW / 2;
  const boardTop = vpSize.h / 2 + pan.y - stageH / 2;

  // Real Figma Zoom-to-Cursor physics via non-passive native wheel listener (prevents browser page zoom on pinch/Ctrl+Wheel!)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      const { zoom: curZoom, pan: curPan, onZoomChange: setZ, onPanChange: setP } = wheelStateRef.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.0025;
        const nextZoom = Math.max(0.2, Math.min(8, Math.round((curZoom * (1 + delta)) * 100) / 100));
        if (nextZoom === curZoom) return;
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const ratio = nextZoom / curZoom;
        setP({
          x: mx - (mx - curPan.x) * ratio,
          y: my - (my - curPan.y) * ratio
        });
        setZ(nextZoom);
      } else {
        e.preventDefault();
        setP({ x: curPan.x - e.deltaX, y: curPan.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  // Window-level panning listeners so dragging over floating panels or outside window never gets stuck
  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPanRef.current = true;
      wheelStateRef.current.onPanChange({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy
      });
    };
    const onEnd = () => setIsPanning(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('blur', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('blur', onEnd);
    };
  }, [isPanning]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'hand' || spaceDown || e.button === 1) {
      e.preventDefault();
      didPanRef.current = false;
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const vp = viewportRef.current;
    if (vp) {
      const vr = vp.getBoundingClientRect();
      setCursorArtboard({
        x: (e.clientX - vr.left - boardLeft) / zoom,
        y: (e.clientY - vr.top - boardTop) / zoom
      });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const artboardCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      ax: (e.clientX - rect.left) / zoom,
      ay: (e.clientY - rect.top) / zoom
    };
  };

  const handleBoardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panModeActive || viewMode !== 'inspect') return;
    const { ax, ay } = artboardCoords(e);
    const deep = e.metaKey || e.ctrlKey || modDown;
    const hit = hitTestLayerSmart(bundle.root, ax, ay, { deep, currentSelectedId: selectedId });
    onHover(hit ? hit.id : null);
  };

  const openAnnotateDraft = (layer: InspectLayer, clientX: number, clientY: number) => {
    const x = Math.min(window.innerWidth - 280, Math.max(16, clientX + 12));
    const y = Math.min(window.innerHeight - 230, Math.max(16, clientY - 12));
    setAnnDraft({ x, y, layer, category: 'dev', text: '' });
  };

  const pinMeasurementBetween = (fromId: string, toLayer: InspectLayer) => {
    const fromL = findLayerById(bundle.root, fromId);
    if (!fromL || fromL.id === toLayer.id) return;
    const segs = computeMeasurements(fromL, toLayer);
    if (segs.length === 0) return;
    const pinned: CanvasMeasurement[] = segs.map((s, i) => ({
      id: `m-${Date.now()}-${i}`,
      fromLayerId: fromL.id,
      toLayerId: toLayer.id,
      orientation: s.orientation,
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      distance: s.distance,
      labelX: s.labelX,
      labelY: s.labelY
    }));
    onMeasurementsChange([...(bundle.measurements || []), ...pinned]);
    setSelectedMeasureId(pinned[0].id);
    onNotify(`Pinned ${pinned.length} measurement${pinned.length > 1 ? 's' : ''} (click × or Delete to remove)`);
  };

  const handleBoardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panModeActive || viewMode !== 'inspect' || tool !== 'measure' || e.button !== 0) return;
    e.stopPropagation();
    const { ax, ay } = artboardCoords(e);
    const deep = e.metaKey || e.ctrlKey || modDown;
    const hit = hitTestLayerSmart(bundle.root, ax, ay, { deep, currentSelectedId: selectedId });
    if (!hit) return;
    if (!measureFromId) {
      setMeasureFromId(hit.id);
      setMeasureDragging(true);
      onSelect(hit.id);
    }
  };

  const handleBoardMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!measureDragging || tool !== 'measure') return;
    setMeasureDragging(false);
    if (!measureFromId) return;
    const { ax, ay } = artboardCoords(e);
    const deep = e.metaKey || e.ctrlKey || modDown;
    const hit = hitTestLayerSmart(bundle.root, ax, ay, { deep, currentSelectedId: selectedId });
    if (hit && hit.id !== measureFromId) {
      pinMeasurementBetween(measureFromId, hit);
      setMeasureFromId(null);
    }
  };

  const handleBoardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panModeActive || viewMode !== 'inspect') return;
    e.stopPropagation();
    setCtxMenu(null);
    setSelectedMeasureId(null);
    setCanvasDeselected(false);
    const { ax, ay } = artboardCoords(e);
    const deep = e.metaKey || e.ctrlKey || modDown;
    const hit = hitTestLayerSmart(bundle.root, ax, ay, { deep, currentSelectedId: selectedId });
    if (!hit) return;

    // Shift+M Measure tool: also supports 2-click pinning (click A -> click B)
    if (tool === 'measure') {
      if (measureFromId && measureFromId !== hit.id) {
        pinMeasurementBetween(measureFromId, hit);
        setMeasureFromId(null);
      } else if (!measureFromId) {
        setMeasureFromId(hit.id);
        onSelect(hit.id);
      }
      return;
    }

    // Shift+T Annotate tool: click layer directly to pin an annotation
    if (tool === 'annotate') {
      onSelect(hit.id);
      openAnnotateDraft(hit, e.clientX, e.clientY);
      return;
    }

    // Shift+Click locks distance measurement between current selection and clicked 2nd layer!
    if (e.shiftKey && !isRootSelected && hit.id !== selectedLayer.id) {
      setLockedCompareId(prev => (prev === hit.id ? null : hit.id));
      return;
    }

    setLockedCompareId(null);
    onSelect(hit.id);
  };

  const handleBoardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (panModeActive || viewMode !== 'inspect' || tool !== 'select') return;
    e.stopPropagation();
    const { ax, ay } = artboardCoords(e);
    const deepHit = hitTestLayerSmart(bundle.root, ax, ay, { deep: true, currentSelectedId: selectedId });
    if (deepHit) onSelect(deepHit.id);
  };

  const handleBoardContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewMode !== 'inspect') return;
    e.preventDefault();
    e.stopPropagation();
    const { ax, ay } = artboardCoords(e);
    const hit = hitTestLayerSmart(bundle.root, ax, ay, {
      deep: e.metaKey || e.ctrlKey,
      currentSelectedId: selectedId
    });
    if (!hit) return;
    onSelect(hit.id);
    const x = Math.min(window.innerWidth - 224, Math.max(12, e.clientX));
    const y = Math.min(window.innerHeight - 310, Math.max(12, e.clientY));
    setCtxMenu({ x, y, layer: hit });
  };

  const copyQuick = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    onNotify(`Copied ${label}`);
    setCtxMenu(null);
  };

  const submitCanvasAnnotation = () => {
    if (!annDraft || !annDraft.text.trim()) return;
    const item: LayerAnnotation = {
      id: `ann-${Date.now()}`,
      layerId: annDraft.layer.id,
      category: annDraft.category,
      text: annDraft.text.trim(),
      createdAt: new Date().toISOString()
    };
    onAnnotationsChange([...(bundle.annotations || []), item]);
    if (!showAnnotations) onToggleAnnotations();
    onNotify(`Pinned annotation on "${annDraft.layer.name}"`);
    setAnnDraft(null);
    setTool('select');
  };

  const appendPropertyChip = (propText: string) => {
    if (!annDraft) return;
    setAnnDraft(prev =>
      prev
        ? { ...prev, text: prev.text.trim() ? `${prev.text.trim()} · ${propText}` : propText }
        : null
    );
  };

  const buildPropertyChips = (l: InspectLayer): { label: string; value: string }[] => {
    const chips: { label: string; value: string }[] = [
      { label: 'Size', value: `${formatUnit(l.width, unit)} × ${formatUnit(l.height, unit)}` }
    ];
    if (l.autoLayout) {
      const al = l.autoLayout;
      chips.push({
        label: 'Padding',
        value: `Padding ${al.paddingTop}/${al.paddingRight}/${al.paddingBottom}/${al.paddingLeft}px`
      });
      if (al.gap > 0) chips.push({ label: 'Gap', value: `Gap ${formatUnit(al.gap, unit)}` });
    }
    if (l.radius) chips.push({ label: 'Radius', value: `Radius ${formatRadius(l.radius, unit)}` });
    if (l.fills?.[0]?.color) {
      const f = l.fills[0];
      chips.push({ label: 'Fill', value: `Fill ${f.token || f.color}` });
    }
    if (l.typography) {
      chips.push({
        label: 'Font',
        value: `${l.typography.fontFamily} ${l.typography.fontWeight} ${l.typography.fontSize}/${l.typography.lineHeight}px`
      });
    }
    return chips;
  };

  const inv = 1 / zoom;
  const selStroke = selectedLayer.componentName ? '#A259FF' : '#0D99FF';
  const showPixelGrid = viewMode === 'inspect' && zoom >= 2.5;
  const hasRealScreenshot = Boolean(bundle.screenshotDataUrl);

  const viewportBackdropClass =
    viewMode === 'preview' && previewBackdrop !== 'canvas' ? `backdrop-${previewBackdrop}` : '';

  return (
    <div
      ref={viewportRef}
      className={`canvas-viewport ${viewportBackdropClass} ${panModeActive ? 'is-panning' : ''} ${tool === 'measure' ? 'is-measure-tool' : ''} ${tool === 'annotate' ? 'is-annotate-tool' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setCursorArtboard(null);
      }}
      onClick={() => {
        if (didPanRef.current) {
          didPanRef.current = false;
          return;
        }
        setCtxMenu(null);
        setSelectedMeasureId(null);
        if (!panModeActive && viewMode === 'inspect' && tool === 'select') {
          onSelect(bundle.root.id);
          setCanvasDeselected(true);
        }
      }}
    >
      {viewMode === 'inspect' && (tool === 'measure' || tool === 'annotate') && (
        <div className="canvas-mode-pill" onClick={e => e.stopPropagation()}>
          {tool === 'measure' ? <Ruler size={12} /> : <MessageSquarePlus size={12} />}
          <span>
            {tool === 'measure'
              ? measureFromLayer
                ? `Click a second layer to pin distance from “${measureFromLayer.name}”`
                : 'Measure tool · Click any two layers to pin distance'
              : 'Annotate tool · Click any layer on canvas to pin a note or property'}
          </span>
          {(bundle.measurements?.length || 0) > 0 && tool === 'measure' && (
            <button
              className="text-action"
              onClick={() => {
                onMeasurementsChange([]);
                setSelectedMeasureId(null);
                onNotify('Cleared all pinned measurements');
              }}
            >
              Clear ({bundle.measurements!.length})
            </button>
          )}
          <button
            className="quiet-icon-btn"
            onClick={() => {
              setTool('select');
              setMeasureFromId(null);
            }}
            title="Exit tool (Esc)"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {showRulers && (
        <CanvasRulers
          viewportWidth={vpSize.w}
          viewportHeight={vpSize.h}
          offsetLeft={rulerOffsetLeft}
          offsetRight={rulerOffsetRight}
          boardLeft={boardLeft}
          boardTop={boardTop}
          zoom={zoom}
          selectedLayer={selectedLayer}
          showSelection={!canvasDeselected}
          cursorArtboard={cursorArtboard}
        />
      )}

      {/* Preview Mode Floating Controls: Breakpoints · Live Variable Mode · Backdrop · Device Bezel */}
      {viewMode === 'preview' && (
        <div className="canvas-mode-pill" onClick={e => e.stopPropagation()}>
          <div className="seg-inline">
            <button
              className={breakpointWidth === null ? 'active' : ''}
              onClick={() => setBreakpointWidth(null)}
              title={`Original (${Math.round(bundle.width)}px)`}
            >
              {Math.round(bundle.width)}
            </button>
            {[375, 768, 1280].map(w => (
              <button
                key={w}
                className={breakpointWidth === w ? 'active' : ''}
                onClick={() => setBreakpointWidth(w)}
                title={`Preview at ${w}px breakpoint`}
              >
                {w}
              </button>
            ))}
          </div>

          {bundle.tokenModes && bundle.tokenModes.length > 1 && (
            <>
              <div className="cmp-sep" />
              <div className="seg-inline">
                {bundle.tokenModes.map(m => (
                  <button
                    key={m}
                    className={activeMode === m ? 'active' : ''}
                    onClick={() => onModeChange(m)}
                    title={`Live preview ${m} variable mode`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="cmp-sep" />
          <div className="cmp-swatches">
            {(['canvas', 'dark', 'light', 'checker'] as PreviewBackdrop[]).map(bg => (
              <button
                key={bg}
                className={`cmp-swatch bg-${bg} ${previewBackdrop === bg ? 'active' : ''}`}
                onClick={() => setPreviewBackdrop(bg)}
                title={`${bg[0].toUpperCase() + bg.slice(1)} backdrop`}
              />
            ))}
          </div>
          {(isMobileFrame || breakpointWidth === 375) && (
            <>
              <div className="cmp-sep" />
              <button
                className={`cmp-toggle ${deviceFrame ? 'active' : ''}`}
                onClick={() => setDeviceFrame(v => !v)}
                title="Toggle iPhone device bezel"
              >
                <Smartphone size={12} />
                <span>Bezel</span>
              </button>
            </>
          )}
          <div className="cmp-sep" />
          <div className="cmp-vision-wrap" title="Color blindness & vision simulator">
            <Eye size={12} />
            <PopoverSelect
              compact
              value={visionMode}
              onChange={v => setVisionMode(v as VisionMode)}
              options={[
                { value: 'normal', label: 'Normal vision' },
                { value: 'protanopia', label: 'Protanopia (Red-blind)' },
                { value: 'deuteranopia', label: 'Deuteranopia (Green-blind)' },
                { value: 'tritanopia', label: 'Tritanopia (Blue-blind)' },
                { value: 'grayscale', label: 'Achromatopsia (Grayscale)' }
              ]}
            />
          </div>
        </div>
      )}

      {/* Hidden SVG Color-Blindness Filter Definitions (Brettel / Daltonize matrices) */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden="true">
        <defs>
          <filter id="cvd-protanopia">
            <feColorMatrix type="matrix" values="0.567,0.433,0,0,0 0.558,0.442,0,0,0 0,0.242,0.758,0,0 0,0,0,1,0" />
          </filter>
          <filter id="cvd-deuteranopia">
            <feColorMatrix type="matrix" values="0.625,0.375,0,0,0 0.7,0.3,0,0,0 0,0.3,0.7,0,0 0,0,0,1,0" />
          </filter>
          <filter id="cvd-tritanopia">
            <feColorMatrix type="matrix" values="0.95,0.05,0,0,0 0,0.433,0.567,0,0 0,0.475,0.525,0,0 0,0,0,1,0" />
          </filter>
          <filter id="cvd-grayscale">
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>

      {/* Canvas Design Lint Filter Bar (when Lint overlay is active) */}
      {viewMode === 'inspect' && showLint && (
        <div className="canvas-mode-pill lint-mode-pill" onClick={e => e.stopPropagation()}>
          <AlertTriangle size={12} className="lint-ic-warn" />
          <span className="lint-bar-title">Design Lint</span>
          <div className="seg-inline">
            <button
              className={lintFilter === 'all' ? 'active' : ''}
              onClick={() => setLintFilter('all')}
            >
              All ({lintReport.counts.all})
            </button>
            <button
              className={lintFilter === 'a11y' ? 'active' : ''}
              onClick={() => setLintFilter('a11y')}
            >
              Contrast ({lintReport.counts.a11y})
            </button>
            <button
              className={lintFilter === 'token' ? 'active' : ''}
              onClick={() => setLintFilter('token')}
            >
              Hardcoded ({lintReport.counts.token})
            </button>
            <button
              className={lintFilter === 'grid' ? 'active' : ''}
              onClick={() => setLintFilter('grid')}
            >
              4px Grid ({lintReport.counts.grid})
            </button>
          </div>
          <button
            type="button"
            className="quiet-icon-btn"
            onClick={() => setShowLint(false)}
            title="Close Lint overlay"
            aria-label="Close Lint overlay"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Shift+Click Locked 2-Layer Distance Banner */}
      {viewMode === 'inspect' && lockedCompareLayer && !showLint && (
        <div className="canvas-mode-pill lock-dist-pill" onClick={e => e.stopPropagation()}>
          <Ruler size={12} />
          <span>
            Locked: <strong>{selectedLayer.name}</strong> ↔ <strong>{lockedCompareLayer.name}</strong>
          </span>
          <button
            type="button"
            className="cmp-toggle active"
            onClick={() => {
              pinMeasurementBetween(selectedLayer.id, lockedCompareLayer);
              setLockedCompareId(null);
            }}
            title="Pin this distance permanently on canvas"
          >
            <Pin size={11} />
            <span>Pin</span>
          </button>
          <button
            type="button"
            className="quiet-icon-btn"
            onClick={() => setLockedCompareId(null)}
            title="Clear distance lock (Esc)"
            aria-label="Clear distance lock"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Compare Mode Floating Controls (Split Curtain or Overlay) */}
      {viewMode === 'diff' && (
        <div className="canvas-mode-pill" onClick={e => e.stopPropagation()}>
          <SplitSquareHorizontal size={12} />
          <div className="seg-inline">
            <button
              className={compareStyle === 'split' ? 'active' : ''}
              onClick={() => setCompareStyle('split')}
            >
              Split
            </button>
            <button
              className={compareStyle === 'overlay' ? 'active' : ''}
              onClick={() => setCompareStyle('overlay')}
            >
              Overlay
            </button>
          </div>
          {compareStyle === 'split' ? (
            <span className="cmp-caption">
              {hasRealScreenshot ? 'Figma PNG ↔ Code' : 'Blueprint ↔ Render'} ·{' '}
              <span className="mono">{Math.round(splitPct)}%</span>
            </span>
          ) : (
            <div className="cmp-slider-wrap">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={diffOpacity}
                onChange={e => setDiffOpacity(Number(e.target.value))}
              />
              <span className="mono">{Math.round(diffOpacity * 100)}%</span>
            </div>
          )}
        </div>
      )}

      {/* Centered Crisp Vector Artboard (true native pixel size — zero CSS scale blur!) */}
      <div
        className={`canvas-stage ${animateTransform && !isPanning && !draggingSplit ? 'smooth-transform' : ''}`}
        style={{
          width: stageW,
          height: stageH,
          transform: `translate3d(${Math.round(pan.x)}px, ${Math.round(pan.y)}px, 0)`
        }}
      >
        <div
          className="artboard-label"
          style={{ width: Math.max(0, stageW), maxWidth: Math.max(0, stageW) }}
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            className={`artboard-name ${!canvasDeselected && selectedLayer.id === bundle.root.id ? 'is-selected' : ''} ${
              bundle.root.componentName ? 'is-comp' : ''
            }`}
            onClick={() => {
              onSelect(bundle.root.id);
              setCanvasDeselected(false);
            }}
            title={`${bundle.name} · Click to select frame`}
          >
            {bundle.name}
          </button>
          {stageW >= 340 && (
            <span className="artboard-dims mono">
              {Math.round(effectivePreviewWidth)} × {Math.round(effectivePreviewHeight)}
              {activeMode && bundle.tokenModes && bundle.tokenModes.length > 1 ? ` · ${activeMode}` : ''}
            </span>
          )}
          {stageW >= 96 && (
            <button
              type="button"
              className={`artboard-status-pill is-${bundle.status === 'in-progress' ? 'progress' : bundle.status} ${
                stageW < 230 ? 'is-compact' : ''
              }`}
              onClick={() => {
                const next: ScreenStatus =
                  bundle.status === 'ready'
                    ? 'in-progress'
                    : bundle.status === 'in-progress'
                      ? 'done'
                      : 'ready';
                onStatusChange(next);
              }}
              title={
                bundle.status === 'ready'
                  ? 'Ready for dev · Click to switch status'
                  : bundle.status === 'in-progress'
                    ? 'In progress · Click to mark completed'
                    : 'Completed · Click to mark ready for dev'
              }
            >
              {bundle.status === 'ready' && (
                <>
                  <Code2 size={11} strokeWidth={2.5} />
                  {stageW >= 230 && <span>Ready for dev</span>}
                </>
              )}
              {bundle.status === 'in-progress' && (
                <>
                  <Clock size={10} strokeWidth={2.4} />
                  {stageW >= 230 && <span>In progress</span>}
                </>
              )}
              {bundle.status === 'done' && (
                <>
                  <CheckCircle2 size={10} strokeWidth={2.4} />
                  {stageW >= 230 && <span>Completed</span>}
                </>
              )}
            </button>
          )}
        </div>

        <div
          ref={frameRef}
          className={`artboard-frame ${viewMode === 'preview' && deviceFrame && (isMobileFrame || breakpointWidth === 375) ? 'has-device-bezel' : ''}`}
          style={{
            width: stageW,
            height: stageH,
            backgroundColor: effectiveRootBg,
            filter: viewMode === 'preview' && visionMode !== 'normal' ? `url(#cvd-${visionMode})` : undefined
          }}
          onMouseDown={handleBoardMouseDown}
          onMouseUp={handleBoardMouseUp}
          onMouseMove={handleBoardMouseMove}
          onMouseLeave={() => onHover(null)}
          onClick={handleBoardClick}
          onDoubleClick={handleBoardDoubleClick}
          onContextMenu={handleBoardContextMenu}
        >
          {/* Base Render Layer — crisp vector DOM at native zoom (or pixelated PNG at ≥250%) */}
          {viewMode === 'inspect' && bundle.screenshotDataUrl ? (
            <img
              src={bundle.screenshotDataUrl}
              alt={bundle.name}
              className={`artboard-render-img ${zoom >= 2.5 ? 'is-pixelated' : ''}`}
              draggable={false}
            />
          ) : (
            <ArtboardVectorView
              bundle={bundle}
              scale={zoom * previewScaleX}
              activeMode={activeMode || undefined}
            />
          )}

          {/* Compare Mode: Split Curtain or Onion-Skin Overlay */}
          {viewMode === 'diff' && (
            <>
              <div
                className="compare-layer"
                style={
                  compareStyle === 'split'
                    ? { clipPath: `inset(0 ${100 - splitPct}% 0 0)` }
                    : { opacity: diffOpacity }
                }
              >
                {hasRealScreenshot ? (
                  <img
                    src={bundle.screenshotDataUrl}
                    alt="Figma Screenshot"
                    className={`artboard-render-img ${zoom >= 2.5 ? 'is-pixelated' : ''}`}
                    draggable={false}
                  />
                ) : (
                  /* Crisp Architectural Spec Blueprint when no external PNG exists */
                  <svg
                    className="blueprint-svg"
                    width={stageW}
                    height={stageH}
                    viewBox={`0 0 ${bundle.width} ${bundle.height}`}
                  >
                    <defs>
                      <pattern id="bp-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                        <path
                          d="M 16 0 L 0 0 0 16"
                          fill="none"
                          stroke="rgba(13, 153, 255, 0.12)"
                          strokeWidth={inv}
                        />
                      </pattern>
                    </defs>
                    <rect width={bundle.width} height={bundle.height} fill="#141923" />
                    <rect width={bundle.width} height={bundle.height} fill="url(#bp-grid)" />
                    {allLayersFlat.map(l => {
                      const isComp = Boolean(l.componentName || l.type === 'COMPONENT' || l.type === 'INSTANCE');
                      const stroke = isComp ? '#A259FF' : l.type === 'TEXT' ? '#38BDF8' : '#0D99FF';
                      return (
                        <g key={`bp-${l.id}`}>
                          <rect
                            x={l.x}
                            y={l.y}
                            width={l.width}
                            height={l.height}
                            fill={isComp ? 'rgba(162, 89, 255, 0.08)' : 'rgba(13, 153, 255, 0.05)'}
                            stroke={stroke}
                            strokeWidth={inv}
                            strokeDasharray={l.type === 'TEXT' ? `${3 * inv} ${2 * inv}` : undefined}
                          />
                          {l.width * zoom >= 68 && l.height * zoom >= 24 && l.id !== bundle.root.id && (
                            <text
                              x={l.x + 5 * inv}
                              y={l.y + 12 * inv}
                              fill={stroke}
                              fontSize={9 * inv}
                              fontFamily="Inter, sans-serif"
                              opacity={0.85}
                            >
                              {l.name.slice(0, 20)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>

              {compareStyle === 'split' && (
                <>
                  <div className="compare-badge left">
                    {hasRealScreenshot ? 'Figma PNG' : 'Spec Blueprint'}
                  </div>
                  <div className="compare-badge right">
                    Live Render
                  </div>
                  <div
                    className="compare-divider"
                    style={{ left: `${splitPct}%` }}
                    onMouseDown={e => {
                      e.stopPropagation();
                      setDraggingSplit(true);
                    }}
                  >
                    <div
                      className="compare-knob"
                      style={{ transform: 'translate(-50%, -50%)' }}
                      title="Drag to compare"
                    >
                      <SplitSquareHorizontal size={12} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Inspect SVG Overlay: Pixel Grid, Outlines, Padding, Gaps, Hover, Selection & Redlines */}
          {viewMode === 'inspect' && (
            <svg
              className="artboard-overlay-svg"
              width={stageW}
              height={stageH}
              viewBox={`0 0 ${bundle.width} ${bundle.height}`}
              style={{ overflow: 'visible' }}
            >
              <defs>
                <pattern
                  id="figma-pad-hatch"
                  width={6 * inv}
                  height={6 * inv}
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2={6 * inv}
                    stroke="rgba(13, 153, 255, 0.44)"
                    strokeWidth={1.15 * inv}
                  />
                </pattern>
                <pattern
                  id="figma-gap-hatch"
                  width={6 * inv}
                  height={6 * inv}
                  patternTransform="rotate(-45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2={6 * inv}
                    stroke="rgba(232, 62, 140, 0.46)"
                    strokeWidth={1.15 * inv}
                  />
                </pattern>
                {showPixelGrid && (
                  <pattern id="figma-px-grid" width="1" height="1" patternUnits="userSpaceOnUse">
                    <path
                      d="M 1 0 L 0 0 0 1"
                      fill="none"
                      stroke="rgba(128, 128, 128, 0.22)"
                      strokeWidth={0.6 * inv}
                    />
                  </pattern>
                )}
              </defs>

              {/* Native Figma Pixel Grid when zoomed ≥ 250% */}
              {showPixelGrid && (
                <rect width={bundle.width} height={bundle.height} fill="url(#figma-px-grid)" />
              )}

              {/* Outlines (Shift+O) */}
              {allOutlines.map(l => (
                <rect
                  key={`out-${l.id}`}
                  x={l.x}
                  y={l.y}
                  width={l.width}
                  height={l.height}
                  fill="none"
                  stroke={l.componentName ? 'rgba(162, 89, 255, 0.38)' : 'rgba(13, 153, 255, 0.3)'}
                  strokeWidth={inv}
                />
              ))}

              {/* Canvas Design Lint Overlays (Contrast / Hardcoded Color / Off 4px Grid) */}
              {visibleLintIssues.map(issue => {
                const color = LINT_COLORS[issue.category];
                return (
                  <g key={issue.id}>
                    <rect
                      x={issue.x}
                      y={issue.y}
                      width={issue.width}
                      height={issue.height}
                      fill={`${color}18`}
                      stroke={color}
                      strokeWidth={1.5 * inv}
                      strokeDasharray={issue.category === 'grid' ? `${4 * inv} ${2.5 * inv}` : undefined}
                    >
                      <title>{`${issue.layerName}: ${issue.message}`}</title>
                    </rect>
                    <circle
                      cx={issue.x + issue.width}
                      cy={issue.y}
                      r={4.2 * inv}
                      fill={color}
                      stroke="#1E1E1E"
                      strokeWidth={1 * inv}
                    >
                      <title>{`${issue.layerName}: ${issue.message}`}</title>
                    </circle>
                  </g>
                );
              })}

              {/* Shift+Click Locked 2nd Layer Highlight */}
              {lockedCompareLayer && (
                <rect
                  x={lockedCompareLayer.x}
                  y={lockedCompareLayer.y}
                  width={lockedCompareLayer.width}
                  height={lockedCompareLayer.height}
                  fill="rgba(242, 72, 34, 0.06)"
                  stroke="#F24822"
                  strokeWidth={1.5 * inv}
                  strokeDasharray={`${4 * inv} ${3 * inv}`}
                />
              )}

              {/* Auto Layout Padding Overlays — authentic Figma Dev Mode BLUE hatch + blue pills */}
              {paddingOverlays.map(p => {
                const isEmphasized = highlightPadSide === p.side;
                const dimmed = highlightPadSide && !isEmphasized;
                const label = unit === 'px' ? String(Math.round(p.value)) : formatUnit(p.value, unit);
                const showPill = isEmphasized || p.width * zoom >= 12 || p.height * zoom >= 12;
                const pillW = Math.max(20, label.length * 5.8 + 8) * inv;
                const pillH = 14 * inv;
                return (
                  <g key={`pad-${p.side}`} opacity={dimmed ? 0.2 : 1}>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.width}
                      height={p.height}
                      fill={isEmphasized ? 'rgba(13, 153, 255, 0.22)' : 'rgba(13, 153, 255, 0.10)'}
                    />
                    <rect x={p.x} y={p.y} width={p.width} height={p.height} fill="url(#figma-pad-hatch)" />
                    {showPill && (
                      <>
                        <rect
                          x={p.x + p.width / 2 - pillW / 2}
                          y={p.y + p.height / 2 - pillH / 2}
                          width={pillW}
                          height={pillH}
                          rx={3 * inv}
                          fill="#0D99FF"
                        />
                        <text
                          x={p.x + p.width / 2}
                          y={p.y + p.height / 2 + 3 * inv}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize={8.5 * inv}
                          fontWeight={600}
                          fontFamily="'JetBrains Mono', monospace"
                        >
                          {label}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* Auto Layout Sibling Gap Overlays — authentic Figma Dev Mode PINK hatch + pink pills */}
              {(!highlightPadSide || highlightPadSide === 'gap') &&
                gapOverlays.map(g => {
                  const isEmphasized = highlightPadSide === 'gap';
                  const label = unit === 'px' ? String(Math.round(g.value)) : formatUnit(g.value, unit);
                  const pillW = Math.max(20, label.length * 5.8 + 8) * inv;
                  const pillH = 14 * inv;
                  return (
                    <g key={g.id}>
                      <rect
                        x={g.x}
                        y={g.y}
                        width={g.width}
                        height={g.height}
                        fill={isEmphasized ? 'rgba(232, 62, 140, 0.24)' : 'rgba(232, 62, 140, 0.10)'}
                      />
                      <rect x={g.x} y={g.y} width={g.width} height={g.height} fill="url(#figma-gap-hatch)" />
                      <rect
                        x={g.x + g.width / 2 - pillW / 2}
                        y={g.y + g.height / 2 - pillH / 2}
                        width={pillW}
                        height={pillH}
                        rx={3 * inv}
                        fill="#E83E8C"
                      />
                      <text
                        x={g.x + g.width / 2}
                        y={g.y + g.height / 2 + 3 * inv}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize={8.5 * inv}
                        fontWeight={600}
                        fontFamily="'JetBrains Mono', monospace"
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}

              {/* Hovered Layer Hairline — authentic Figma colors (purple comp, blue layer, green annotate, coral measure) */}
              {hoveredLayer && hoveredLayer.id !== selectedLayer.id && (
                <rect
                  x={hoveredLayer.x}
                  y={hoveredLayer.y}
                  width={hoveredLayer.width}
                  height={hoveredLayer.height}
                  fill={tool === 'annotate' ? 'rgba(20, 174, 92, 0.06)' : 'none'}
                  stroke={
                    tool === 'annotate'
                      ? '#14AE5C'
                      : tool === 'measure' || altDown
                        ? '#F24822'
                        : hoveredLayer.componentName || hoveredLayer.type === 'COMPONENT' || hoveredLayer.type === 'INSTANCE'
                          ? '#A259FF'
                          : '#0D99FF'
                  }
                  strokeWidth={1.25 * inv}
                />
              )}

              {/* Selected Layer Bounding Box — pure Dev Mode hairline (no Design Mode corner resize boxes!) */}
              {!canvasDeselected && (
                <rect
                  x={selectedLayer.x}
                  y={selectedLayer.y}
                  width={selectedLayer.width}
                  height={selectedLayer.height}
                  fill="none"
                  stroke={selStroke}
                  strokeWidth={1.35 * inv}
                />
              )}

              {/* Annotation Anchor Dots + Connector Lines */}
              {resolvedAnnotations.map(({ ann, target }, idx) => {
                const meta = ANN_META[ann.category];
                const anchorRight = target.x + target.width / 2 > bundle.width * 0.62;
                const ax = anchorRight ? target.x : target.x + target.width;
                const ay = Math.max(8, target.y + (idx % 2) * 4) + 10 * inv;
                const bx = anchorRight ? target.x - 10 * inv : target.x + target.width + 10 * inv;
                return (
                  <g key={`ann-dot-${ann.id}`}>
                    <line
                      x1={ax}
                      y1={ay}
                      x2={bx}
                      y2={ay}
                      stroke={meta.color}
                      strokeWidth={1.25 * inv}
                      opacity={0.85}
                    />
                    <circle
                      cx={ax}
                      cy={ay}
                      r={2.8 * inv}
                      fill={meta.color}
                      stroke="#FFFFFF"
                      strokeWidth={1 * inv}
                    />
                  </g>
                );
              })}

              {/* Measure Tool Anchor Ring */}
              {tool === 'measure' && measureFromLayer && (
                <rect
                  x={measureFromLayer.x}
                  y={measureFromLayer.y}
                  width={measureFromLayer.width}
                  height={measureFromLayer.height}
                  fill="rgba(242, 72, 34, 0.08)"
                  stroke="#F24822"
                  strokeWidth={1.6 * inv}
                  strokeDasharray={`${4 * inv} ${2.5 * inv}`}
                />
              )}

              {/* Persistent Pinned Measurements (Shift+M — clickable to select & Delete) */}
              {(bundle.measurements || []).map(seg => {
                const label = formatUnit(seg.distance, unit);
                const pillW = Math.max(30, label.length * 6.4 + 12) * inv;
                const pillH = 17 * inv;
                const cap = 3.5 * inv;
                const isSelM = selectedMeasureId === seg.id;
                const color = isSelM ? '#0D99FF' : '#E11D48';

                return (
                  <g
                    key={seg.id}
                    className="pinned-measure-group"
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedMeasureId(seg.id);
                    }}
                  >
                    <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke={color} strokeWidth={1.4 * inv} />
                    {seg.orientation === 'horizontal' ? (
                      <>
                        <line x1={seg.x1} y1={seg.y1 - cap} x2={seg.x1} y2={seg.y1 + cap} stroke={color} strokeWidth={1.4 * inv} />
                        <line x1={seg.x2} y1={seg.y2 - cap} x2={seg.x2} y2={seg.y2 + cap} stroke={color} strokeWidth={1.4 * inv} />
                      </>
                    ) : (
                      <>
                        <line x1={seg.x1 - cap} y1={seg.y1} x2={seg.x1 + cap} y2={seg.y1} stroke={color} strokeWidth={1.4 * inv} />
                        <line x1={seg.x2 - cap} y1={seg.y2} x2={seg.x2 + cap} y2={seg.y2} stroke={color} strokeWidth={1.4 * inv} />
                      </>
                    )}
                    <rect
                      x={seg.labelX - pillW / 2}
                      y={seg.labelY - pillH / 2}
                      width={pillW}
                      height={pillH}
                      rx={3.5 * inv}
                      fill={color}
                      stroke={isSelM ? '#FFFFFF' : 'none'}
                      strokeWidth={isSelM ? 1.2 * inv : 0}
                    />
                    <text
                      x={seg.labelX}
                      y={seg.labelY + 3.2 * inv}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize={9.5 * inv}
                      fontWeight={700}
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      {label}
                    </text>
                    {isSelM && (
                      <g
                        onClick={e => {
                          e.stopPropagation();
                          onMeasurementsChange((bundle.measurements || []).filter(m => m.id !== seg.id));
                          setSelectedMeasureId(null);
                          onNotify('Removed pinned measurement');
                        }}
                      >
                        <circle
                          cx={seg.labelX + pillW / 2 + 8 * inv}
                          cy={seg.labelY}
                          r={7 * inv}
                          fill="#1E1E1E"
                          stroke="#FFFFFF"
                          strokeWidth={inv}
                        />
                        <text
                          x={seg.labelX + pillW / 2 + 8 * inv}
                          y={seg.labelY + 3 * inv}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize={9 * inv}
                          fontWeight={700}
                        >
                          ×
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Precision Figma Redline Distances */}
              {redlines.map(seg => {
                const label = formatUnit(seg.distance, unit);
                const pillW = Math.max(28, label.length * 6.4 + 10) * inv;
                const pillH = 16 * inv;
                const cap = 3.2 * inv;

                return (
                  <g key={seg.id}>
                    {seg.guide && (
                      <line
                        x1={seg.guide.x1}
                        y1={seg.guide.y1}
                        x2={seg.guide.x2}
                        y2={seg.guide.y2}
                        stroke="#F24822"
                        strokeWidth={inv}
                        strokeDasharray={`${3 * inv} ${2.5 * inv}`}
                        opacity={0.7}
                      />
                    )}
                    <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke="#F24822" strokeWidth={1.1 * inv} />
                    {seg.orientation === 'horizontal' ? (
                      <>
                        <line x1={seg.x1} y1={seg.y1 - cap} x2={seg.x1} y2={seg.y1 + cap} stroke="#F24822" strokeWidth={1.1 * inv} />
                        <line x1={seg.x2} y1={seg.y2 - cap} x2={seg.x2} y2={seg.y2 + cap} stroke="#F24822" strokeWidth={1.1 * inv} />
                      </>
                    ) : (
                      <>
                        <line x1={seg.x1 - cap} y1={seg.y1} x2={seg.x1 + cap} y2={seg.y1} stroke="#F24822" strokeWidth={1.1 * inv} />
                        <line x1={seg.x2 - cap} y1={seg.y2} x2={seg.x2 + cap} y2={seg.y2} stroke="#F24822" strokeWidth={1.1 * inv} />
                      </>
                    )}
                    <rect
                      x={seg.labelX - pillW / 2}
                      y={seg.labelY - pillH / 2}
                      width={pillW}
                      height={pillH}
                      rx={3 * inv}
                      fill="#F24822"
                    />
                    <text
                      x={seg.labelX}
                      y={seg.labelY + 3.2 * inv}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize={9.5 * inv}
                      fontWeight={600}
                      fontFamily="'JetBrains Mono', monospace"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Hover Layer Name Tag — flips inside top-left near y=0 so it never collides with artboard title */}
          {viewMode === 'inspect' && hoveredLayer && (canvasDeselected || hoveredLayer.id !== selectedLayer.id) && hoveredLayer.id !== bundle.root.id && (
            <div
              className="hover-name-pill"
              style={{
                left: hoveredLayer.y * zoom < 28 ? hoveredLayer.x * zoom + 4 : hoveredLayer.x * zoom,
                top: hoveredLayer.y * zoom < 28 ? hoveredLayer.y * zoom + 4 : hoveredLayer.y * zoom - 22
              }}
            >
              {hoveredLayer.componentName && <Diamond size={9} />}
              <span>{hoveredLayer.name}</span>
              <span className="hnp-dim mono">
                {Math.round(hoveredLayer.width)}×{Math.round(hoveredLayer.height)}
              </span>
            </div>
          )}

          {/* Authentic Figma Dev Mode Selected Size Pill (hidden cleanly when empty canvas is clicked) */}
          {viewMode === 'inspect' && !canvasDeselected && (
            <div
              className={`selected-size-pill mono ${selectedLayer.componentName ? 'is-comp' : ''} ${
                selectedLayer.width * zoom >= 68 &&
                (selectedLayer.type === 'FRAME' || selectedLayer.type === 'COMPONENT' || selectedLayer.type === 'INSTANCE')
                  ? 'is-detailed'
                  : ''
              }`}
              style={{
                left: (selectedLayer.x + selectedLayer.width / 2) * zoom,
                top: (selectedLayer.y + selectedLayer.height) * zoom + 7,
                transform: 'translateX(-50%)'
              }}
            >
              {selectedLayer.width * zoom >= 68 &&
              (selectedLayer.type === 'FRAME' || selectedLayer.type === 'COMPONENT' || selectedLayer.type === 'INSTANCE') ? (
                <>
                  <div>
                    <span className="ssp-axis">W</span> Fixed {formatUnit(selectedLayer.width, unit)}
                  </div>
                  <div>
                    <span className="ssp-axis">H</span> Fixed {formatUnit(selectedLayer.height, unit)}
                  </div>
                </>
              ) : (
                `${Math.round(selectedLayer.width)} × ${Math.round(selectedLayer.height)}`
              )}
            </div>
          )}

          {/* Figma Dev Mode Pinned Canvas Annotations (1x crisp native pixels!) */}
          {resolvedAnnotations.map(({ ann, target }, idx) => {
            const meta = ANN_META[ann.category];
            const isSel = target.id === selectedLayer.id;
            const anchorRight = target.x + target.width / 2 > bundle.width * 0.62;
            const pinX = anchorRight ? target.x * zoom - 10 : (target.x + target.width) * zoom + 10;
            const pinY = Math.max(8, (target.y + (idx % 2) * 4) * zoom);
            return (
              <div
                key={ann.id}
                className={`canvas-ann-pin ${isSel ? 'is-active' : ''} ${anchorRight ? 'align-left' : 'align-right'}`}
                style={{
                  left: pinX,
                  top: pinY,
                  transform: anchorRight ? 'translateX(-100%)' : undefined
                }}
                onClick={e => {
                  e.stopPropagation();
                  onSelect(target.id);
                }}
                onMouseEnter={() => onHover(target.id)}
                onMouseLeave={() => onHover(null)}
                title={`${meta.label} · ${target.name}: ${ann.text}`}
              >
                <span className="ann-pin-dot" style={{ background: meta.color }} />
                <span className="ann-pin-cat" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                <span className="ann-pin-text">{ann.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Quick-Copy Bar + Breadcrumbs above Bottom Dock (Inspect mode) */}
      {viewMode === 'inspect' && !canvasDeselected && !isRootSelected && (
        <div className="canvas-quickcopy-bar" onClick={e => e.stopPropagation()}>
          <div className="qc-actions">
            <button
              type="button"
              className="qc-btn"
              onClick={() => copyQuick(layerToTailwind(selectedLayer), 'Tailwind classes')}
              title="Copy Tailwind classes"
            >
              <FileCode2 size={11} />
              <span>Tailwind</span>
            </button>
            <button
              type="button"
              className="qc-btn"
              onClick={() => {
                const css = Object.entries(layerToCssMap(selectedLayer, unit))
                  .map(([k, v]) => `${k}: ${v};`)
                  .join('\n');
                copyQuick(css, 'CSS');
              }}
              title="Copy CSS properties"
            >
              <Copy size={11} />
              <span>CSS</span>
            </button>
            {selectedLayer.text && (
              <button
                type="button"
                className="qc-btn"
                onClick={() => copyQuick(selectedLayer.text!, 'text')}
                title="Copy text content"
              >
                <span>Text</span>
              </button>
            )}
            {selectedLayer.svg && (
              <button
                type="button"
                className="qc-btn"
                onClick={() => copyQuick(selectedLayer.svg!, 'SVG')}
                title="Copy SVG markup"
              >
                <span>SVG</span>
              </button>
            )}
            <button
              type="button"
              className="qc-btn is-ai"
              onClick={() =>
                copyQuick(buildAiPrompt(bundle, selectedLayer, unit, 'react-tailwind-ts', 'layer'), 'AI prompt')
              }
              title="Copy structured prompt for Cursor / Claude / ChatGPT"
            >
              <Sparkles size={11} />
              <span>AI Prompt</span>
            </button>
          </div>
          {breadcrumbs.length > 1 && (
            <div className="qc-crumbs">
              {breadcrumbs.slice(-3).map((node, idx, arr) => {
                const isLast = idx === arr.length - 1;
                const isComp = Boolean(node.componentName || node.type === 'COMPONENT' || node.type === 'INSTANCE');
                return (
                  <React.Fragment key={node.id}>
                    {idx > 0 && <ChevronRight size={9} className="crumb-sep" />}
                    <button
                      className={`crumb-btn ${isLast ? 'active' : ''} ${isComp ? 'is-comp' : ''}`}
                      onClick={() => onSelect(node.id)}
                      title={`${node.name} · Shift+Click another layer to lock distance`}
                    >
                      {isComp && <Diamond size={8} />}
                      <span>{node.name}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sleek Figma UI3 Bottom Dock */}
      <div className="figma-dock" onClick={e => e.stopPropagation()}>
        <button
          className={`dock-tool ${tool === 'select' && !spaceDown ? 'active' : ''}`}
          onClick={() => {
            setTool('select');
            setMeasureFromId(null);
          }}
          title="Inspect (V)"
        >
          <MousePointer2 size={15} />
        </button>
        <button
          className={`dock-tool ${tool === 'measure' && !spaceDown ? 'active' : ''}`}
          onClick={() => {
            onViewModeChange('inspect');
            setTool(t => (t === 'measure' ? 'select' : 'measure'));
            setMeasureFromId(null);
          }}
          title="Measure tool — pin persistent distances (Shift+M)"
        >
          <Ruler size={14} />
        </button>
        <button
          className={`dock-tool ${tool === 'annotate' && !spaceDown ? 'active' : ''}`}
          onClick={() => {
            onViewModeChange('inspect');
            setTool(t => (t === 'annotate' ? 'select' : 'annotate'));
            setMeasureFromId(null);
          }}
          title="Annotate tool — click any layer to pin note/property (Shift+T)"
        >
          <MessageSquarePlus size={14} />
        </button>
        <button
          className={`dock-tool ${tool === 'hand' || spaceDown ? 'active' : ''}`}
          onClick={() => {
            setTool('hand');
            setMeasureFromId(null);
          }}
          title="Hand tool (H or Space)"
        >
          <Hand size={15} />
        </button>
        <button
          className={`dock-tool dock-ann-btn ${showAnnotations ? 'is-on' : ''}`}
          onClick={onToggleAnnotations}
          title={`${showAnnotations ? 'Hide' : 'Show'} canvas annotations (A)`}
        >
          <MessageSquareText size={14} />
          {annCount > 0 && <span className="dock-ann-count">{annCount}</span>}
        </button>
        <button
          className={`dock-tool dock-ann-btn dock-lint-btn ${showLint ? 'is-lint-on' : ''}`}
          onClick={() => {
            onViewModeChange('inspect');
            setShowLint(v => !v);
          }}
          title={`Design Lint overlay — ${lintReport.counts.all} issue${lintReport.counts.all === 1 ? '' : 's'} (Contrast, Hardcoded colors, 4px Grid)`}
        >
          <AlertTriangle size={14} />
          {lintReport.counts.all > 0 && (
            <span className="dock-lint-count">{lintReport.counts.all}</span>
          )}
        </button>

        <div className="dock-sep" />

        <div className="dock-seg">
          <button className={viewMode === 'inspect' ? 'active' : ''} onClick={() => onViewModeChange('inspect')}>
            Inspect
          </button>
          <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => onViewModeChange('preview')}>
            Preview
          </button>
          <button className={viewMode === 'diff' ? 'active' : ''} onClick={() => onViewModeChange('diff')}>
            Compare
          </button>
        </div>

        <div className="dock-sep" />

        <div className="dev-badge-dock" title="Dev Mode active — hover to measure, right-click to copy, ⌘/Ctrl+click deep-select">
          <Code2 size={14} />
        </div>
      </div>

      {/* Native Figma Right-Click Canvas Context Menu */}
      {ctxMenu &&
        createPortal(
          <div
            className="canvas-ctx-menu"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <div className="ctx-head">
              <span className="ctx-layer-name">{ctxMenu.layer.name}</span>
              <span className="ctx-layer-type">{ctxMenu.layer.type.toLowerCase()}</span>
            </div>

            <button
              className="ctx-item"
              onClick={() => {
                const css = Object.entries(layerToCssMap(ctxMenu.layer, unit))
                  .map(([k, v]) => `${k}: ${v};`)
                  .join('\n');
                copyQuick(css, 'CSS');
              }}
            >
              <Copy size={12} />
              <span>Copy as CSS</span>
            </button>

            <button
              className="ctx-item"
              onClick={() => copyQuick(layerToTailwind(ctxMenu.layer), 'Tailwind classes')}
            >
              <FileCode2 size={12} />
              <span>Copy Tailwind</span>
            </button>

            {ctxMenu.layer.text && (
              <button
                className="ctx-item"
                onClick={() => copyQuick(ctxMenu.layer.text!, 'text')}
              >
                <Copy size={12} />
                <span>Copy text</span>
              </button>
            )}

            {ctxMenu.layer.svg && (
              <button
                className="ctx-item"
                onClick={() => copyQuick(ctxMenu.layer.svg!, 'SVG')}
              >
                <Copy size={12} />
                <span>Copy as SVG</span>
              </button>
            )}

            <button
              className="ctx-item"
              onClick={() =>
                copyQuick(buildAiPrompt(bundle, ctxMenu.layer, unit, 'react-tailwind-ts', 'layer'), 'AI prompt')
              }
            >
              <Sparkles size={12} />
              <span>Copy for AI</span>
            </button>

            <div className="ctx-sep" />

            {parentMap.get(ctxMenu.layer.id) && (
              <button
                className="ctx-item"
                onClick={() => {
                  const p = parentMap.get(ctxMenu.layer.id);
                  if (p) onSelect(p.id);
                  setCtxMenu(null);
                }}
              >
                <ChevronRight size={12} />
                <span>Select parent ({parentMap.get(ctxMenu.layer.id)!.name})</span>
              </button>
            )}

            <button
              className="ctx-item"
              onClick={() => {
                setTool('measure');
                setMeasureFromId(ctxMenu.layer.id);
                setCtxMenu(null);
                onNotify(`Measure from "${ctxMenu.layer.name}" — click a second layer`);
              }}
            >
              <Ruler size={12} />
              <span>Measure from here</span>
            </button>

            <button
              className="ctx-item"
              onClick={() => {
                const { layer, x, y } = ctxMenu;
                setCtxMenu(null);
                openAnnotateDraft(layer, x, y);
              }}
            >
              <MessageSquarePlus size={12} />
              <span>Add annotation</span>
            </button>

            {(bundle.measurements?.length || 0) > 0 && (
              <>
                <div className="ctx-sep" />
                <button
                  className="ctx-item is-danger"
                  onClick={() => {
                    onMeasurementsChange([]);
                    setSelectedMeasureId(null);
                    setCtxMenu(null);
                    onNotify('Cleared pinned measurements');
                  }}
                >
                  <Trash2 size={12} />
                  <span>Clear pinned measurements ({bundle.measurements!.length})</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      {/* Direct Canvas Annotate Popover (Shift+T) with Figma "+ Property" Chips */}
      {annDraft &&
        createPortal(
          <div
            className="canvas-ann-popover"
            style={{ left: annDraft.x, top: annDraft.y }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <div className="ann-pop-head">
              <span className="ann-pop-title">Annotate · {annDraft.layer.name}</span>
              <button className="quiet-icon-btn" onClick={() => setAnnDraft(null)} aria-label="Close">
                <X size={12} />
              </button>
            </div>

            <div className="ann-cat-row">
              {(['dev', 'a11y', 'interaction', 'content'] as AnnotationCategory[]).map(c => (
                <button
                  key={c}
                  className={`ann-cat-pill ${annDraft.category === c ? 'active' : ''}`}
                  onClick={() => setAnnDraft(prev => (prev ? { ...prev, category: c } : null))}
                >
                  <span className="ann-pin-dot" style={{ background: ANN_META[c].color }} />
                  <span>{ANN_META[c].label}</span>
                </button>
              ))}
            </div>

            <div className="ann-prop-chips">
              {buildPropertyChips(annDraft.layer).map(ch => (
                <button
                  key={ch.label}
                  className="ann-prop-chip"
                  onClick={() => appendPropertyChip(ch.value)}
                  title={`Insert ${ch.value}`}
                >
                  + {ch.label}
                </button>
              ))}
            </div>

            <textarea
              className="ann-pop-input"
              rows={2}
              autoFocus
              placeholder="Write handoff note or click + Property above…"
              value={annDraft.text}
              onChange={e => setAnnDraft(prev => (prev ? { ...prev, text: e.target.value } : null))}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                  e.preventDefault();
                  submitCanvasAnnotation();
                } else if (e.key === 'Escape') {
                  setAnnDraft(null);
                }
              }}
            />

            <div className="ann-pop-foot">
              <span className="ann-pop-hint">Enter to pin</span>
              <button
                className="fig-btn-primary"
                disabled={!annDraft.text.trim()}
                onClick={submitCanvasAnnotation}
              >
                Pin annotation
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
