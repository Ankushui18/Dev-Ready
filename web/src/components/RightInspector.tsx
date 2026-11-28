import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Component,
  Copy,
  Download,
  ExternalLink,
  Figma,
  FileCode2,
  FileJson,
  GitBranch,
  GitCompareArrows,
  History,
  Link2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Table2,
  Ticket,
  X,
  XCircle
} from 'lucide-react';
import type {
  AnnotationCategory,
  AutoLayoutSpec,
  ChecklistItem,
  CodeConnectEntry,
  CodeTarget,
  DevReadyBundle,
  DevResource,
  DevResourceKind,
  InspectLayer,
  LayerAnnotation,
  ScreenStatus,
  UnitMode
} from '../types';
import { formatRadius, formatUnit } from '../lib/measure';
import { CODE_TARGETS, exportTokens, formatVariableSyntax, generateCode, layerToCssMap, makeZip } from '../lib/codegen';
import { runA11yAudit } from '../lib/a11y';
import { SyntaxCode } from '../lib/syntax';
import { PopoverSelect } from './PopoverSelect';
import { CodeConnectModal } from './CodeConnectModal';
import { ComponentPlaygroundModal } from './ComponentPlaygroundModal';
import { findSuggestedToken, findTokenByRef } from '../lib/tokens';
import { buildLayerDiffCards, type DiffCodeLang } from '../lib/diff';
import { fmtShift } from '../lib/platform';
import { buildAiPrompt, buildMcpJson } from '../lib/aiContext';
import type { PadSide } from './InspectCanvas';

type ColorFormat = 'HEX' | 'RGB' | 'HSL';

function formatColorValue(hex: string | undefined, fmt: ColorFormat): string {
  if (!hex) return '';
  const clean = hex.replace('#', '');
  if (fmt === 'HEX' || clean.length !== 6) return hex.toUpperCase();
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (fmt === 'RGB') return `rgb(${r}, ${g}, ${b})`;
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function detectResourceKind(url: string): DevResourceKind {
  const low = url.toLowerCase();
  if (low.includes('github.com') || low.includes('gitlab.com')) return 'github';
  if (low.includes('linear.app')) return 'linear';
  if (low.includes('atlassian.net') || low.includes('jira')) return 'jira';
  if (low.includes('storybook') || low.includes('chromatic.com')) return 'storybook';
  if (low.includes('figma.com')) return 'figma';
  if (low.includes('notion.') || low.includes('docs.')) return 'docs';
  return 'link';
}

function defaultResourceLabel(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length >= 1) return segs.slice(-2).join('/');
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 32);
  }
}

function ResourceIcon({ kind }: { kind: DevResourceKind }) {
  if (kind === 'github') return <GitBranch size={12} />;
  if (kind === 'storybook') return <BookOpen size={12} />;
  if (kind === 'linear' || kind === 'jira') return <Ticket size={12} />;
  if (kind === 'figma') return <Figma size={12} />;
  return <Link2 size={12} />;
}

interface RightInspectorProps {
  width: number;
  bundle: DevReadyBundle;
  layer: InspectLayer;
  unit: UnitMode;
  zoom: number;
  showRulers: boolean;
  showOutlines: boolean;
  showPadding: boolean;
  activeMode: string;
  onModeChange: (mode: string) => void;
  onResizeWidth: (w: number) => void;
  onHoverPadSide: (side: PadSide) => void;
  onZoomChange: (z: number) => void;
  onFitToScreen: () => void;
  onZoomToSelection: () => void;
  onToggleRulers: () => void;
  onToggleOutlines: () => void;
  onTogglePadding: () => void;
  onStatusChange: (status: ScreenStatus) => void;
  onChecklistChange: (items: ChecklistItem[]) => void;
  onAnnotationsChange: (items: LayerAnnotation[]) => void;
  onDevResourcesChange: (items: DevResource[]) => void;
  onCodeConnectChange: (map: Record<string, CodeConnectEntry>) => void;
  onOpenImport: () => void;
  onOpenShare: () => void;
  onSyncFromFigma?: () => void;
  syncingFigma?: boolean;
  onOpenCompareChanges: (historyId?: string) => void;
  onOpenVariablesTable: (tokenName?: string) => void;
  onSelectLayer: (id: string) => void;
  onNotify: (msg: string) => void;
}

const AlignmentMatrix: React.FC<{ al: AutoLayoutSpec }> = ({ al }) => {
  const rowIdx = al.direction === 'HORIZONTAL'
    ? (al.alignItems === 'CENTER' ? 1 : al.alignItems === 'END' ? 2 : 0)
    : (al.justifyContent === 'CENTER' ? 1 : al.justifyContent === 'END' ? 2 : 0);
  const colIdx = al.direction === 'HORIZONTAL'
    ? (al.justifyContent === 'CENTER' ? 1 : al.justifyContent === 'END' ? 2 : 0)
    : (al.alignItems === 'CENTER' ? 1 : al.alignItems === 'END' ? 2 : 0);

  return (
    <div className="al-matrix" title={`${al.alignItems || 'START'} / ${al.justifyContent || 'START'}`}>
      {[0, 1, 2].map(r =>
        [0, 1, 2].map(c => (
          <span key={`${r}-${c}`} className={`al-cell ${r === rowIdx && c === colIdx ? 'active' : ''}`} />
        ))
      )}
    </div>
  );
};

export const RightInspector: React.FC<RightInspectorProps> = ({
  width,
  bundle,
  layer,
  unit,
  zoom,
  showRulers,
  showOutlines,
  showPadding,
  activeMode,
  onModeChange,
  onResizeWidth,
  onHoverPadSide,
  onZoomChange,
  onFitToScreen,
  onZoomToSelection,
  onToggleRulers,
  onToggleOutlines,
  onTogglePadding,
  onStatusChange,
  onChecklistChange,
  onAnnotationsChange,
  onDevResourcesChange,
  onCodeConnectChange,
  onOpenImport,
  onOpenShare,
  onSyncFromFigma,
  syncingFigma,
  onOpenCompareChanges,
  onOpenVariablesTable,
  onSelectLayer,
  onNotify
}) => {
  const [tab, setTab] = useState<'inspect' | 'code' | 'tokens' | 'a11y'>('inspect');
  const [codeTarget, setCodeTarget] = useState<CodeTarget>('react-tailwind-ts');
  const [tokenFmt, setTokenFmt] = useState<'css' | 'tailwind' | 'json' | 'scss'>('css');
  const [colorFmt, setColorFmt] = useState<ColorFormat>('HEX');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newAnnText, setNewAnnText] = useState('');
  const [newAnnCat, setNewAnnCat] = useState<AnnotationCategory>('dev');
  const [showAddRes, setShowAddRes] = useState(false);
  const [newResUrl, setNewResUrl] = useState('');
  const [newResLabel, setNewResLabel] = useState('');
  const [newResScope, setNewResScope] = useState<'layer' | 'screen'>('layer');
  const [aiScope, setAiScope] = useState<'layer' | 'screen'>('layer');
  const [codeSourceMode, setCodeSourceMode] = useState<'connect' | 'auto'>('connect');
  const [inspectDisplayMode, setInspectDisplayMode] = useState<'code' | 'list'>('code');
  const [inspectLang, setInspectLang] = useState<DiffCodeLang>('css');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);
  const [secOpen, setSecOpen] = useState<{
    details: boolean;
    annotations: boolean;
    resources: boolean;
    checklist: boolean;
    history: boolean;
  }>({
    details: false,
    annotations: false,
    resources: false,
    checklist: false,
    history: false
  });
  const toggleSec = (k: 'details' | 'annotations' | 'resources' | 'checklist' | 'history') =>
    setSecOpen(prev => ({ ...prev, [k]: !prev[k] }));
  const zoomRef = useRef<HTMLDivElement>(null);
  const zoomPortalRef = useRef<HTMLDivElement>(null);
  const [zoomMenuCoords, setZoomMenuCoords] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const updatePos = () => {
      const rect = zoomRef.current?.getBoundingClientRect();
      if (!rect) return;
      setZoomMenuCoords({
        top: rect.bottom + 5,
        right: Math.max(8, window.innerWidth - rect.right)
      });
    };
    updatePos();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!zoomRef.current?.contains(t) && !zoomPortalRef.current?.contains(t)) {
        setZoomMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomMenuOpen(false);
    };
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updatePos);
    };
  }, [zoomMenuOpen]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const onMove = (ev: MouseEvent) => {
      onResizeWidth(Math.max(264, Math.min(480, startW - (ev.clientX - startX))));
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

  const copyText = async (text: string, key: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onNotify(label ? `Copied ${label}` : 'Copied');
      setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1300);
    } catch {
      onNotify('Clipboard blocked — copy manually');
    }
  };

  const cssEntries = useMemo(() => layerToCssMap(layer, unit), [layer, unit]);
  const inspectCards = useMemo(
    () => buildLayerDiffCards(layer, layer, inspectLang, unit),
    [layer, inspectLang, unit]
  );

  const inspectListRows = useMemo(() => {
    const rows: { label: string; value: string; swatch?: string; token?: string }[] = [
      { label: 'Width', value: formatUnit(layer.width, unit) },
      { label: 'Height', value: formatUnit(layer.height, unit) }
    ];
    if (layer.autoLayout) {
      const al = layer.autoLayout;
      rows.push({ label: 'Direction', value: al.direction === 'HORIZONTAL' ? 'Row (flex)' : 'Column (flex)' });
      const pad =
        al.paddingTop === al.paddingRight && al.paddingRight === al.paddingBottom && al.paddingBottom === al.paddingLeft
          ? formatUnit(al.paddingTop, unit)
          : `${formatUnit(al.paddingTop, unit)} ${formatUnit(al.paddingRight, unit)} ${formatUnit(al.paddingBottom, unit)} ${formatUnit(al.paddingLeft, unit)}`;
      if (al.paddingTop || al.paddingRight || al.paddingBottom || al.paddingLeft) {
        rows.push({ label: 'Padding', value: pad });
      }
      if (al.gap > 0) rows.push({ label: 'Gap', value: formatUnit(al.gap, unit) });
    }
    if (layer.radius) rows.push({ label: 'Border radius', value: formatRadius(layer.radius, unit) });
    if (layer.fills?.[0]) {
      const f = layer.fills[0];
      rows.push({
        label: layer.type === 'TEXT' ? 'Color' : 'Background',
        value: f.token ? `var(${f.token}, ${f.color || ''})` : f.gradient || f.color || '',
        swatch: f.gradient || f.color,
        token: f.token
      });
    }
    if (layer.strokes?.[0]) {
      const s = layer.strokes[0];
      rows.push({
        label: 'Border',
        value: `${s.width}px solid ${s.token ? `var(${s.token}, ${s.color})` : s.color}`,
        swatch: s.color,
        token: s.token
      });
    }
    if (layer.typography) {
      const t = layer.typography;
      rows.push({ label: 'Font', value: `${t.fontFamily} · ${t.fontWeight}` });
      rows.push({ label: 'Size / Line', value: `${formatUnit(t.fontSize, unit)} / ${formatUnit(t.lineHeight, unit)}` });
    }
    if (layer.opacity !== undefined && layer.opacity < 1) {
      rows.push({ label: 'Opacity', value: `${Math.round(layer.opacity * 100)}%` });
    }
    return rows;
  }, [layer, unit]);

  const fmtEditedShort = (iso: string): string => {
    const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `Edited ${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `Edited ${hrs}h ago`;
    return `Edited ${Math.round(hrs / 24)}d ago`;
  };

  const renderInspectValue = (valText: string) => {
    const m = valText.match(/var\((--[a-zA-Z0-9_-]+)([^)]*)\)/);
    if (!m) return <span className="fig-tok-val">{valText}</span>;
    const idx = m.index ?? 0;
    const before = valText.slice(0, idx);
    const varToken = m[1];
    const restInside = m[2] || '';
    const after = valText.slice(idx + m[0].length);
    return (
      <>
        {before && <span className="fig-tok-val">{before}</span>}
        <span className="fig-code-fn">var(</span>
        <button
          className="fig-code-var-link"
          onClick={e => {
            e.stopPropagation();
            onOpenVariablesTable(varToken.replace(/^--/, ''));
          }}
          title={`Inspect ${varToken} in Variables table`}
        >
          {varToken}
        </button>
        {restInside && <span className="fig-code-fn">{restInside}</span>}
        <span className="fig-code-fn">)</span>
        {after && <span className="fig-tok-val">{after}</span>}
      </>
    );
  };

  const renderInspectLineContent = (text: string) => {
    // Highlight CSS "property: value;" cleanly just like Figma Dev Mode
    const colonIdx = text.indexOf(':');
    if (colonIdx > 0 && !text.startsWith('className=') && !text.startsWith('.')) {
      const prop = text.slice(0, colonIdx);
      const rest = text.slice(colonIdx + 1);
      return (
        <>
          <span className="fig-tok-prop">{prop}</span>
          <span className="fig-tok-punct">:</span>
          {renderInspectValue(rest)}
        </>
      );
    }
    return renderInspectValue(text);
  };
  const cssSnippet = useMemo(() => cssEntries.map(([k, v]) => `${k}: ${v};`).join('\n'), [cssEntries]);
  const generatedCode = useMemo(() => generateCode(layer, codeTarget, unit), [layer, codeTarget, unit]);
  const tokensOutput = useMemo(
    () => exportTokens(bundle.tokens, tokenFmt, activeMode || undefined),
    [bundle.tokens, tokenFmt, activeMode]
  );
  const a11yFindings = useMemo(
    () => runA11yAudit(bundle.root, bundle.backgroundColor),
    [bundle.root, bundle.backgroundColor]
  );

  const a11yIssues = a11yFindings.filter(f => f.severity !== 'pass').length;
  const checklist = bundle.checklist || [];
  const allAnnotations = bundle.annotations || [];
  const layerAnnotations = allAnnotations.filter(a => a.layerId === layer.id);
  const otherAnnotations = allAnnotations.filter(a => a.layerId !== layer.id);

  const addAnnotation = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newAnnText.trim();
    if (!text) return;
    onAnnotationsChange([
      ...allAnnotations,
      {
        id: `ann-${Date.now()}`,
        layerId: layer.id,
        category: newAnnCat,
        text,
        createdAt: new Date().toISOString()
      }
    ]);
    setNewAnnText('');
    onNotify(`Annotated "${layer.name}"`);
  };

  const removeAnnotation = (id: string) => {
    onAnnotationsChange(allAnnotations.filter(a => a.id !== id));
  };

  const allResources = bundle.devResources || [];
  const visibleResources = allResources.filter(r => !r.layerId || r.layerId === layer.id);

  const addResource = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = newResUrl.trim();
    if (!raw) return;
    if (/^(javascript|data|vbscript):/i.test(raw)) {
      onNotify('Only http:// or https:// links are allowed');
      return;
    }
    const normalizedUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(normalizedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        onNotify('Only http:// or https:// links are allowed');
        return;
      }
    } catch {
      onNotify('Enter a valid URL (e.g. github.com/org/repo)');
      return;
    }
    const item: DevResource = {
      id: `res-${Date.now()}`,
      layerId: newResScope === 'layer' ? layer.id : undefined,
      url: normalizedUrl,
      label: newResLabel.trim() || defaultResourceLabel(normalizedUrl),
      kind: detectResourceKind(normalizedUrl)
    };
    onDevResourcesChange([...allResources, item]);
    setNewResUrl('');
    setNewResLabel('');
    setShowAddRes(false);
    onNotify(`Linked ${item.label}`);
  };

  const removeResource = (id: string) => {
    onDevResourcesChange(allResources.filter(r => r.id !== id));
  };

  const ccMap = bundle.codeConnect || {};
  const compKey = layer.componentName || (layer.type === 'COMPONENT' || layer.type === 'INSTANCE' ? layer.name : undefined);
  const connectedEntry = compKey ? ccMap[compKey] : undefined;
  const connectedCodeBlock = connectedEntry
    ? `${connectedEntry.importPath}\n\n${connectedEntry.snippet}`
    : '';
  const activeCodeText = connectedEntry && codeSourceMode === 'connect' ? connectedCodeBlock : generatedCode;

  const saveCodeConnect = (entry: CodeConnectEntry) => {
    onCodeConnectChange({ ...ccMap, [entry.componentName]: entry });
    setCodeSourceMode('connect');
    onNotify(`Connected "${entry.componentName}" to codebase`);
  };

  const removeCodeConnect = (name: string) => {
    const next = { ...ccMap };
    delete next[name];
    onCodeConnectChange(next);
    onNotify(`Disconnected "${name}"`);
  };

  const targetOptions = useMemo(
    () => CODE_TARGETS.map(t => ({ value: t.id, label: t.label, group: t.group })),
    []
  );

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadCodeFile = () => {
    const meta = CODE_TARGETS.find(t => t.id === codeTarget);
    const ext = meta?.ext || 'txt';
    const slug = layer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'component';
    downloadBlob(new Blob([generatedCode], { type: 'text/plain;charset=utf-8' }), `${slug}.${ext}`);
    onNotify(`Saved ${slug}.${ext}`);
  };

  const handleDownloadProjectZip = () => {
    const meta = CODE_TARGETS.find(t => t.id === codeTarget);
    const ext = meta?.ext || 'tsx';
    const slug = bundle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'devready-screen';
    const files: Array<{ name: string; content: string }> = [
      { name: `src/${slug}.${ext}`, content: generateCode(bundle.root, codeTarget, unit) },
      { name: 'src/tokens.css', content: exportTokens(bundle.tokens, 'css', activeMode || undefined) },
      { name: 'src/tokens.json', content: exportTokens(bundle.tokens, 'json', activeMode || undefined) }
    ];
    for (const asset of bundle.assets || []) {
      if (asset.svg) files.push({ name: `assets/${asset.name}.svg`, content: asset.svg });
    }
    downloadBlob(makeZip(files), `${slug}-devready.zip`);
    onNotify(`Downloaded ${slug}-devready.zip`);
  };

  const addChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTask.trim();
    if (!text) return;
    onChecklistChange([...checklist, { id: `chk-${Date.now()}`, text, done: false }]);
    setNewTask('');
  };

  const toggleChecklistItem = (id: string) => {
    onChecklistChange(checklist.map(item => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  return (
    <aside className="floating-panel right-panel" style={{ width }}>
      <div className="resize-edge resize-left" onMouseDown={startResize} title="Drag to resize" />

      {/* Top Action Bar */}
      <div className="panel-top-row right-top">
        <div className="right-top-left">
          <button className="btn-quiet-sm" onClick={onOpenImport} title="Import frame from Figma">
            <Figma size={12} />
            <span>Import</span>
          </button>
          {bundle.figmaUrl && onSyncFromFigma && (
            <button
              className="quiet-icon-btn"
              onClick={onSyncFromFigma}
              disabled={syncingFigma}
              title="Sync latest changes from Figma (creates Compare Changes snapshot)"
              aria-label="Sync latest from Figma"
            >
              <RefreshCw size={12} className={syncingFigma ? 'spin' : ''} />
            </button>
          )}
          <button className="btn-figma-dev-green" onClick={onOpenShare}>
            Share
          </button>
        </div>

        <div ref={zoomRef} className="zoom-pop-wrap">
          <button
            className="zoom-menu-btn mono"
            onClick={() => setZoomMenuOpen(v => !v)}
            title="Zoom & canvas options"
          >
            <span>{Math.round(zoom * 100)}%</span>
            <ChevronDown size={11} />
          </button>
          {zoomMenuOpen &&
            zoomMenuCoords &&
            createPortal(
              <div
                ref={zoomPortalRef}
                className="pop-menu pop-menu-portal zoom-menu"
                style={{ top: zoomMenuCoords.top, right: zoomMenuCoords.right, left: 'auto' }}
              >
                <button className="pop-item" onClick={() => { onZoomChange(Math.min(8, Math.round((zoom + 0.25) * 100) / 100)); setZoomMenuOpen(false); }}>
                  <span className="pop-check" />
                  <span className="pop-item-text"><span>Zoom in</span><span className="pop-item-sub">+</span></span>
                </button>
                <button className="pop-item" onClick={() => { onZoomChange(Math.max(0.2, Math.round((zoom - 0.2) * 100) / 100)); setZoomMenuOpen(false); }}>
                  <span className="pop-check" />
                  <span className="pop-item-text"><span>Zoom out</span><span className="pop-item-sub">-</span></span>
                </button>
                <button className="pop-item" onClick={() => { onFitToScreen(); setZoomMenuOpen(false); }}>
                  <span className="pop-check" />
                  <span className="pop-item-text"><span>Zoom to fit</span><span className="pop-item-sub">0</span></span>
                </button>
                <button className="pop-item" onClick={() => { onZoomToSelection(); setZoomMenuOpen(false); }}>
                  <span className="pop-check" />
                  <span className="pop-item-text"><span>Zoom to selection</span><span className="pop-item-sub">{fmtShift('2')}</span></span>
                </button>
                <button className="pop-item" onClick={() => { onZoomChange(1); setZoomMenuOpen(false); }}>
                  <span className="pop-check" />
                  <span className="pop-item-text"><span>Zoom to 100%</span><span className="pop-item-sub">1</span></span>
                </button>
                <div className="pop-sep" />
                <button className="pop-item" onClick={() => { onToggleRulers(); setZoomMenuOpen(false); }}>
                  <span className="pop-check">{showRulers ? <Check size={11} /> : null}</span>
                  <span className="pop-item-text"><span>Rulers</span><span className="pop-item-sub">{fmtShift('R')}</span></span>
                </button>
                <button className="pop-item" onClick={() => { onTogglePadding(); setZoomMenuOpen(false); }}>
                  <span className="pop-check">{showPadding ? <Check size={11} /> : null}</span>
                  <span className="pop-item-text"><span>Spacing guides</span></span>
                </button>
                <button className="pop-item" onClick={() => { onToggleOutlines(); setZoomMenuOpen(false); }}>
                  <span className="pop-check">{showOutlines ? <Check size={11} /> : null}</span>
                  <span className="pop-item-text"><span>Outlines</span><span className="pop-item-sub">{fmtShift('O')}</span></span>
                </button>
              </div>,
              document.body
            )}
        </div>
      </div>

      {/* Quiet Underline Tabs */}
      <div className="panel-tabs">
        <button className={`p-tab ${tab === 'inspect' ? 'active' : ''}`} onClick={() => setTab('inspect')}>
          Inspect
        </button>
        <button className={`p-tab ${tab === 'code' ? 'active' : ''}`} onClick={() => setTab('code')}>
          Code
        </button>
        <button className={`p-tab ${tab === 'tokens' ? 'active' : ''}`} onClick={() => setTab('tokens')}>
          Tokens
        </button>
        <button className={`p-tab ${tab === 'a11y' ? 'active' : ''}`} onClick={() => setTab('a11y')}>
          A11y{a11yIssues > 0 ? ` (${a11yIssues})` : ''}
        </button>
      </div>

      <div className="inspector-scroll">
        {/* ================= INSPECT TAB (Authentic Figma UI3 Above-the-Fold Flow) ================= */}
        {tab === 'inspect' && (
          <>
            {/* 1. Layer Identity Header + Compare Changes (exact Figma Dev Mode top) */}
            <div className="insp-block">
              <div className="insp-node-row">
                <span className="insp-node-name" title={layer.name}>
                  {layer.name}
                </span>
                <PopoverSelect
                  value={bundle.status}
                  compact
                  align="right"
                  options={[
                    { value: 'ready', label: 'Ready for dev', dotColor: '#14AE5C' },
                    { value: 'in-progress', label: 'In progress', dotColor: '#F59E0B' },
                    { value: 'done', label: 'Completed', dotColor: '#0D99FF' }
                  ]}
                  onChange={onStatusChange}
                />
              </div>

              <div className="insp-type-meta-row">
                <span className="insp-type-tag">
                  # {layer.type.charAt(0) + layer.type.slice(1).toLowerCase()} · {fmtEditedShort(bundle.updatedAt)}
                </span>
                {(bundle.history?.some((h, idx) => Boolean(h.rootSnapshot) && !(idx === 0 && h.rootSnapshot === bundle.root)) ||
                  false) && (
                  <button
                    className="compare-changes-inline"
                    onClick={() => onOpenCompareChanges()}
                    title="Compare current design with previous versions"
                  >
                    <GitCompareArrows size={11} />
                    <span>Compare changes</span>
                  </button>
                )}
              </div>

              {compKey && (
                <div className="comp-meta-row">
                  <div className="comp-meta">
                    <Component size={11} />
                    <span>{compKey}</span>
                  </div>
                  <div className="comp-actions">
                    <button
                      className="cc-pill-btn"
                      onClick={() => setShowPlayground(true)}
                      title="Open Component Playground"
                    >
                      <Play size={9} />
                      <span>Playground</span>
                    </button>
                    <button
                      className={`cc-pill-btn ${connectedEntry ? 'is-connected' : ''}`}
                      onClick={() => setShowConnectModal(true)}
                      title={connectedEntry ? 'Edit Code Connect mapping' : 'Map to real codebase component'}
                    >
                      {connectedEntry ? 'Connected' : '+ Connect'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Code Section ABOVE THE FOLD: Full 3-Layer Figma Box Model + Clean Layout & Style Cards */}
            <div className="insp-block">
              <div className="block-head">
                <span className="block-title">Code</span>
                <div className="insp-code-controls">
                  <div className="seg-inline">
                    <button
                      className={inspectDisplayMode === 'list' ? 'active' : ''}
                      onClick={() => setInspectDisplayMode('list')}
                    >
                      List
                    </button>
                    <button
                      className={inspectDisplayMode === 'code' ? 'active' : ''}
                      onClick={() => setInspectDisplayMode('code')}
                    >
                      Code
                    </button>
                  </div>
                  {inspectDisplayMode === 'code' ? (
                    <PopoverSelect<DiffCodeLang>
                      compact
                      align="right"
                      ariaLabel="Inspect snippet language"
                      value={inspectLang}
                      onChange={setInspectLang}
                      options={[
                        { value: 'css', label: 'CSS' },
                        { value: 'tailwind', label: 'Tailwind' },
                        { value: 'swiftui', label: 'SwiftUI' },
                        { value: 'compose', label: 'Compose' }
                      ]}
                    />
                  ) : (
                    <button className="text-action" onClick={() => copyText(cssSnippet, 'css-inline', 'CSS')}>
                      {copiedKey === 'css-inline' ? 'Copied' : 'Copy all'}
                    </button>
                  )}
                </div>
              </div>

              {/* Context-Aware Figma Dev Mode Specimen: Unified Typography Card (TEXT) vs Full 3-Layer Figma Box Model */}
              {layer.type === 'TEXT' && layer.typography ? (
                <div className="fig-typo-wrap">
                  <div className="fig-typo-specimen">
                    <div
                      className="fig-typo-aa"
                      style={{
                        fontFamily: `${layer.typography.fontFamily}, Inter, sans-serif`,
                        fontWeight: layer.typography.fontWeight
                      }}
                    >
                      Aa
                    </div>
                    <div className="fig-typo-meta">
                      <div className="fig-typo-family">{layer.typography.fontFamily}</div>
                      <div className="fig-typo-stats mono">
                        {layer.typography.fontWeight} · {formatUnit(layer.typography.fontSize, unit)} /{' '}
                        {formatUnit(layer.typography.lineHeight, unit)}
                        {layer.typography.letterSpacing ? ` · ${layer.typography.letterSpacing}px` : ''}
                      </div>
                    </div>
                  </div>
                  {layer.text && (
                    <button
                      className="text-preview-line clickable"
                      onClick={() => copyText(layer.text!, 'txt-val', 'text')}
                      title="Click to copy text content"
                    >
                      “{layer.text}”
                    </button>
                  )}
                </div>
              ) : (() => {
                const radii: [number, number, number, number] = Array.isArray(layer.radius)
                  ? [layer.radius[0], layer.radius[1], layer.radius[2], layer.radius[3]]
                  : typeof layer.radius === 'number'
                    ? [layer.radius, layer.radius, layer.radius, layer.radius]
                    : [0, 0, 0, 0];
                const hasRadius = radii.some(r => r > 0);
                const strokeW = layer.strokes?.[0]?.width || 0;
                const gapVal = layer.autoLayout?.gap || 0;
                const padTop = layer.autoLayout?.paddingTop || 0;
                const padRight = layer.autoLayout?.paddingRight || 0;
                const padBottom = layer.autoLayout?.paddingBottom || 0;
                const padLeft = layer.autoLayout?.paddingLeft || 0;
                const isRow = layer.autoLayout?.direction === 'HORIZONTAL';
                const outerV = !isRow && gapVal > 0 ? gapVal : padTop;
                const outerH = isRow && gapVal > 0 ? gapVal : padLeft;

                return (
                  <div className="fig-box-model-v2" onMouseLeave={() => onHoverPadSide(null)}>
                    {/* Outer Pink Top Spacing Badge */}
                    <button
                      type="button"
                      className={`fbm2-outer-pill is-pink top mono ${outerV > 0 ? '' : 'is-zero'}`}
                      onMouseEnter={() => onHoverPadSide(gapVal > 0 && !isRow ? 'gap' : 'top')}
                      onClick={() => copyText(`${Math.round(outerV)}px`, 'bm-ov-t', 'vertical spacing')}
                      title={gapVal > 0 && !isRow ? `Auto layout gap: ${Math.round(gapVal)}px` : `Top spacing: ${Math.round(outerV)}px`}
                    >
                      {Math.round(outerV)}
                    </button>

                    <div className="fbm2-mid-row">
                      {/* Outer Blue Left Spacing Badge */}
                      <button
                        type="button"
                        className={`fbm2-outer-pill is-blue left mono ${outerH > 0 ? '' : 'is-zero'}`}
                        onMouseEnter={() => onHoverPadSide(gapVal > 0 && isRow ? 'gap' : 'left')}
                        onClick={() => copyText(`${Math.round(outerH)}px`, 'bm-oh-l', 'horizontal spacing')}
                        title={gapVal > 0 && isRow ? `Auto layout gap: ${Math.round(gapVal)}px` : `Left spacing: ${Math.round(outerH)}px`}
                      >
                        {Math.round(outerH)}
                      </button>

                      {/* Border Layer with 4 Corner Radii + Border Width */}
                      <div className="fbm2-border-box">
                        <span className="fbm2-layer-tag is-border">Border</span>
                        {hasRadius && (
                          <>
                            <span className="fbm2-corner tl mono" title="Top-left radius">{Math.round(radii[0])}</span>
                            <span className="fbm2-corner tr mono" title="Top-right radius">{Math.round(radii[1])}</span>
                            <span className="fbm2-corner br mono" title="Bottom-right radius">{Math.round(radii[2])}</span>
                            <span className="fbm2-corner bl mono" title="Bottom-left radius">{Math.round(radii[3])}</span>
                          </>
                        )}
                        <span className="fbm2-stroke-val top mono" title="Border width">{strokeW > 0 ? Math.round(strokeW) : '–'}</span>
                        <span className="fbm2-stroke-val bottom mono" title="Border width">{strokeW > 0 ? Math.round(strokeW) : '–'}</span>

                        {/* Dashed Padding Layer (interactive hover highlights blue hatch on canvas!) */}
                        <div className="fbm2-pad-box">
                          <span className="fbm2-layer-tag is-pad">Padding</span>
                          {([
                            ['top', padTop],
                            ['right', padRight],
                            ['bottom', padBottom],
                            ['left', padLeft]
                          ] as const).map(([side, val]) => (
                            <button
                              key={side}
                              type="button"
                              className={`fbm2-pad-num ${side} mono ${val > 0 ? 'has-val' : ''}`}
                              onMouseEnter={() => onHoverPadSide(side)}
                              onClick={() =>
                                copyText(`padding-${side}: ${formatUnit(val, unit)};`, `pad-${side}`, `padding-${side}`)
                              }
                              title={`Hover to highlight · Click to copy padding-${side}`}
                            >
                              {Math.round(val)}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="fbm2-inner-dims mono"
                            onClick={() =>
                              copyText(
                                `width: ${formatUnit(layer.width, unit)}; height: ${formatUnit(layer.height, unit)};`,
                                'bm-dims',
                                'dimensions'
                              )
                            }
                            title="Click to copy width & height"
                          >
                            {Math.round(layer.width)}×{Math.round(layer.height)}
                          </button>
                        </div>
                      </div>

                      {/* Outer Blue Right Spacing Badge */}
                      <button
                        type="button"
                        className={`fbm2-outer-pill is-blue right mono ${outerH > 0 ? '' : 'is-zero'}`}
                        onMouseEnter={() => onHoverPadSide(gapVal > 0 && isRow ? 'gap' : 'right')}
                        onClick={() => copyText(`${Math.round(outerH)}px`, 'bm-oh-r', 'horizontal spacing')}
                        title={`Right spacing: ${Math.round(outerH)}px`}
                      >
                        {Math.round(outerH)}
                      </button>
                    </div>

                    {/* Outer Pink Bottom Spacing Badge */}
                    <button
                      type="button"
                      className={`fbm2-outer-pill is-pink bottom mono ${outerV > 0 ? '' : 'is-zero'}`}
                      onMouseEnter={() => onHoverPadSide(gapVal > 0 && !isRow ? 'gap' : 'bottom')}
                      onClick={() => copyText(`${Math.round(outerV)}px`, 'bm-ov-b', 'vertical spacing')}
                      title={`Bottom spacing: ${Math.round(outerV)}px`}
                    >
                      {Math.round(outerV)}
                    </button>
                  </div>
                );
              })()}

              {/* Clean, Gutter-Free Layout & Style Code Cards (1-click single-line copy + Figma syntax colors) */}
              {inspectDisplayMode === 'code' ? (
                <div className="fig-split-code-cards">
                  <div className="fig-code-card">
                    <div className="fig-code-card-head">
                      <span>Layout</span>
                      <button
                        className="quiet-icon-btn"
                        onClick={() =>
                          copyText(
                            inspectCards.layout.map(l => l.text).join('\n'),
                            'insp-layout-code',
                            `Layout ${inspectLang.toUpperCase()}`
                          )
                        }
                        title="Copy Layout snippet"
                      >
                        {copiedKey === 'insp-layout-code' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <div className="fig-code-lines is-clean">
                      {inspectCards.layout.map((l, idx) => (
                        <div
                          key={`il-${idx}`}
                          className="fig-code-line is-copyable"
                          onClick={() => copyText(l.text, `il-${idx}`, l.text)}
                          title="Click to copy line"
                        >
                          <span className="fig-lc mono">{renderInspectLineContent(l.text)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {inspectCards.style.length > 0 && (
                    <div className="fig-code-card">
                      <div className="fig-code-card-head">
                        <span>Style</span>
                        <button
                          className="quiet-icon-btn"
                          onClick={() =>
                            copyText(
                              inspectCards.style.map(l => l.text).join('\n'),
                              'insp-style-code',
                              `Style ${inspectLang.toUpperCase()}`
                            )
                          }
                          title="Copy Style snippet"
                        >
                          {copiedKey === 'insp-style-code' ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="fig-code-lines is-clean">
                        {inspectCards.style.map((l, idx) => (
                          <div
                            key={`is-${idx}`}
                            className="fig-code-line is-copyable"
                            onClick={() => copyText(l.text, `is-${idx}`, l.text)}
                            title="Click to copy line"
                          >
                            <span className="fig-lc mono">
                              {l.swatch && (
                                <span
                                  className="cmp-inline-swatch"
                                  style={{ background: l.swatch }}
                                />
                              )}
                              {renderInspectLineContent(l.text)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="fig-prop-list">
                  {inspectListRows.map((row, idx) => (
                    <button
                      key={`pr-${idx}`}
                      className="fig-prop-row"
                      onClick={() => copyText(row.value, `pl-${idx}`, row.label)}
                      title={`Click to copy ${row.value}`}
                    >
                      <span className="fig-prop-k">{row.label}</span>
                      <span className="fig-prop-v mono">
                        {row.swatch && (
                          <span className="cmp-inline-swatch" style={{ background: row.swatch }} />
                        )}
                        <span className={row.token ? 'has-var-dash' : ''}>{row.value}</span>
                        <span className="fig-prop-copy">
                          {copiedKey === `pl-${idx}` ? <Check size={10} /> : <Copy size={10} />}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Inline Assets Strip (exact Figma Dev Mode Assets preview inside Inspect) */}
            {(bundle.assets?.length || 0) > 0 && (
              <div className="insp-block">
                <div className="block-head">
                  <span className="block-title">Assets</span>
                  <button className="text-action" onClick={() => setTab('tokens')}>
                    All ({bundle.assets!.length})
                  </button>
                </div>
                <div className="insp-assets-mini">
                  {bundle.assets!.slice(0, 3).map(a => (
                    <div key={a.id} className="insp-asset-row">
                      <div
                        className="insp-asset-thumb"
                        dangerouslySetInnerHTML={{ __html: a.svg || '' }}
                      />
                      <div className="insp-asset-info">
                        <span className="insp-asset-name">{a.name}</span>
                        <span className="insp-asset-sub mono">
                          SVG · {a.width}×{a.height}
                        </span>
                      </div>
                      {a.svg && (
                        <button
                          className="quiet-icon-btn"
                          onClick={() =>
                            downloadBlob(new Blob([a.svg!], { type: 'image/svg+xml' }), `${a.name}.svg`)
                          }
                          title={`Download ${a.name}.svg`}
                        >
                          <Download size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Collapsible Geometry, Auto Layout & Colors/Variables Details */}
            <div className={`insp-block ${!secOpen.details ? 'is-collapsed' : ''}`}>
              <div className="block-head insp-acc-head">
                <button
                  type="button"
                  className="insp-acc-btn"
                  onClick={() => toggleSec('details')}
                  aria-expanded={secOpen.details}
                >
                  <span className="insp-acc-chev">
                    {secOpen.details ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <span className="block-title">Properties &amp; colors</span>
                </button>
                {secOpen.details && (
                  <div className="seg-inline">
                    {(['HEX', 'RGB', 'HSL'] as const).map(f => (
                      <button key={f} className={colorFmt === f ? 'active' : ''} onClick={() => setColorFmt(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {secOpen.details && (
                <div className="insp-details-stack">
                  <div className="flat-grid-2">
                    {[
                      ['X', formatUnit(layer.x, unit)],
                      ['Y', formatUnit(layer.y, unit)],
                      ['W', formatUnit(layer.width, unit)],
                      ['H', formatUnit(layer.height, unit)],
                      ['R', formatRadius(layer.radius, unit)],
                      ['α', `${Math.round((layer.opacity ?? 1) * 100)}%`]
                    ].map(([k, v]) => (
                      <button
                        key={k}
                        className="flat-input"
                        onClick={() => copyText(v, `geo-${k}`, `${k}: ${v}`)}
                        title={`Click to copy ${v}`}
                      >
                        <span className="fi-k">{k}</span>
                        <span className="fi-v mono">{v}</span>
                      </button>
                    ))}
                  </div>

                  {layer.autoLayout && (
                    <div className="al-row">
                      <AlignmentMatrix al={layer.autoLayout} />
                      <div className="al-fields">
                        <button
                          className="flat-input"
                          onClick={() => copyText(formatUnit(layer.autoLayout!.gap, unit), 'al-gap', 'gap')}
                        >
                          <span className="fi-k">Gap</span>
                          <span className="fi-v mono">{formatUnit(layer.autoLayout.gap, unit)}</span>
                        </button>
                        <button
                          className="flat-input"
                          onClick={() =>
                            copyText(
                              `${layer.autoLayout!.paddingTop}px ${layer.autoLayout!.paddingRight}px`,
                              'al-pad',
                              'padding'
                            )
                          }
                        >
                          <span className="fi-k">Pad</span>
                          <span className="fi-v mono">
                            {layer.autoLayout.paddingTop} · {layer.autoLayout.paddingLeft}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {(layer.fills?.length || layer.strokes?.length || layer.effects?.length) ? (
                    <div className="flat-list">
                      {layer.fills?.map((f, i) => {
                        const formatted = f.type === 'LINEAR_GRADIENT' ? 'Gradient' : formatColorValue(f.color, colorFmt);
                        const varSyntax = f.token
                          ? formatVariableSyntax(f.token, codeTarget, layer.type === 'TEXT' ? 'text' : 'bg')
                          : null;
                        const boundToken = f.token ? findTokenByRef(f.token, bundle.tokens) : null;
                        const suggested = !f.token ? findSuggestedToken(f.color, bundle.tokens, activeMode) : null;
                        const suggestedSyntax = suggested
                          ? formatVariableSyntax(suggested.name, codeTarget, layer.type === 'TEXT' ? 'text' : 'bg')
                          : null;
                        return (
                          <div key={`f-${i}`} className="swatch-row-group">
                            <div className="flat-swatch-row">
                              <span className="swatch-sq" style={{ background: f.gradient || f.color || '#ccc' }} />
                              <div className="swatch-text">
                                {varSyntax ? (
                                  <button
                                    className="var-link-btn mono"
                                    onClick={() => onOpenVariablesTable(boundToken?.name || f.token?.replace(/^--/, ''))}
                                    title="Inspect variable details & modes"
                                  >
                                    {varSyntax}
                                  </button>
                                ) : (
                                  <span className="swatch-primary mono">{formatted}</span>
                                )}
                                {varSyntax && f.color && (
                                  <span className="swatch-sec mono">
                                    {f.token} · {formatted}
                                  </span>
                                )}
                              </div>
                              <button
                                className="quiet-icon-btn row-copy"
                                onClick={() => copyText(varSyntax || f.gradient || formatted, `f-${i}`, varSyntax ? 'variable syntax' : 'color')}
                                title={varSyntax ? `Copy ${varSyntax}` : 'Copy'}
                              >
                                {copiedKey === `f-${i}` ? <Check size={12} /> : <Copy size={12} />}
                              </button>
                            </div>
                            {suggested && suggestedSyntax && (
                              <div className="suggested-var-row">
                                <span className="suggested-var-tag">Suggested</span>
                                <button
                                  className="suggested-var-chip mono"
                                  onClick={() => copyText(suggestedSyntax, `sug-f-${i}`, suggestedSyntax)}
                                  title={`Raw ${formatted} matches local variable "${suggested.name}" — click to copy`}
                                >
                                  <span>{suggestedSyntax}</span>
                                  {copiedKey === `sug-f-${i}` ? <Check size={10} /> : <Copy size={10} />}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {layer.strokes?.map((s, i) => {
                        const varSyntax = s.token ? formatVariableSyntax(s.token, codeTarget, 'border') : null;
                        const boundToken = s.token ? findTokenByRef(s.token, bundle.tokens) : null;
                        const suggested = !s.token ? findSuggestedToken(s.color, bundle.tokens, activeMode) : null;
                        const suggestedSyntax = suggested
                          ? formatVariableSyntax(suggested.name, codeTarget, 'border')
                          : null;
                        return (
                          <div key={`s-${i}`} className="swatch-row-group">
                            <div className="flat-swatch-row">
                              <span className="swatch-sq" style={{ background: s.color }} />
                              <div className="swatch-text">
                                {varSyntax ? (
                                  <button
                                    className="var-link-btn mono"
                                    onClick={() => onOpenVariablesTable(boundToken?.name || s.token?.replace(/^--/, ''))}
                                    title="Inspect variable details & modes"
                                  >
                                    {varSyntax}
                                  </button>
                                ) : (
                                  <span className="swatch-primary mono">{formatColorValue(s.color, colorFmt)}</span>
                                )}
                                <span className="swatch-sec mono">Border {s.width}px</span>
                              </div>
                              <button
                                className="quiet-icon-btn row-copy"
                                onClick={() => copyText(varSyntax || formatColorValue(s.color, colorFmt), `s-${i}`, 'border color')}
                                title="Copy"
                              >
                                {copiedKey === `s-${i}` ? <Check size={12} /> : <Copy size={12} />}
                              </button>
                            </div>
                            {suggested && suggestedSyntax && (
                              <div className="suggested-var-row">
                                <span className="suggested-var-tag">Suggested</span>
                                <button
                                  className="suggested-var-chip mono"
                                  onClick={() => copyText(suggestedSyntax, `sug-s-${i}`, suggestedSyntax)}
                                  title={`Raw border matches "${suggested.name}" — click to copy`}
                                >
                                  <span>{suggestedSyntax}</span>
                                  {copiedKey === `sug-s-${i}` ? <Check size={10} /> : <Copy size={10} />}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {layer.effects?.map((e, i) => (
                        <div key={`e-${i}`} className="flat-swatch-row">
                          <span className="swatch-sq shadow-sq" />
                          <div className="swatch-text">
                            <span className="swatch-primary">Drop shadow</span>
                            <span className="swatch-sec mono">{e.x || 0} {e.y || 0} {e.blur}px</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Canvas Annotations for Selected Layer (Collapsible Figma Section) */}
            <div className={`insp-block ${!secOpen.annotations ? 'is-collapsed' : ''}`}>
              <div className="block-head insp-acc-head">
                <button
                  type="button"
                  className="insp-acc-btn"
                  onClick={() => toggleSec('annotations')}
                  aria-expanded={secOpen.annotations}
                >
                  <span className="insp-acc-chev">
                    {secOpen.annotations ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <span className="block-title">Annotations</span>
                  <span className="insp-acc-count mono">
                    {layerAnnotations.length > 0 ? layerAnnotations.length : allAnnotations.length}
                  </span>
                </button>
                <span className="block-sub mono">
                  {layerAnnotations.length > 0 ? 'on layer' : 'screen'}
                </span>
              </div>

              {secOpen.annotations && (
                <>
                  {layerAnnotations.length > 0 && (
                    <div className="ann-list">
                      {layerAnnotations.map(ann => (
                        <div key={ann.id} className="ann-row">
                          <span className={`ann-tag cat-${ann.category}`}>{ann.category}</span>
                          <span className="ann-row-text">{ann.text}</span>
                          <button
                            className="quiet-icon-btn ann-del"
                            onClick={() => removeAnnotation(ann.id)}
                            title="Remove annotation"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="ann-cat-pills">
                    {(['dev', 'a11y', 'interaction', 'content'] as AnnotationCategory[]).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        className={`ann-cat-pill cat-${cat} ${newAnnCat === cat ? 'active' : ''}`}
                        onClick={() => setNewAnnCat(cat)}
                      >
                        {cat === 'a11y' ? 'A11y' : cat[0].toUpperCase() + cat.slice(1)}
                      </button>
                    ))}
                  </div>
                  <form className="chk-add-form" onSubmit={addAnnotation}>
                    <input
                      type="text"
                      placeholder={`Annotate ${layer.name}…`}
                      value={newAnnText}
                      onChange={e => setNewAnnText(e.target.value)}
                    />
                    <button type="submit" className="quiet-icon-btn" title="Pin annotation" disabled={!newAnnText.trim()}>
                      <Plus size={12} />
                    </button>
                  </form>

                  {otherAnnotations.length > 0 && (
                    <div className="ann-others">
                      <div className="ann-others-label">Other pinned specs</div>
                      {otherAnnotations.map(ann => (
                        <button
                          key={ann.id}
                          className="ann-other-row"
                          onClick={() => onSelectLayer(ann.layerId)}
                          title="Jump to annotated layer"
                        >
                          <span className={`ann-dot cat-${ann.category}`} />
                          <span className="ann-other-txt">{ann.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Dev Resources (GitHub · Linear · Jira · Storybook) */}
            <div className={`insp-block ${!secOpen.resources && !showAddRes ? 'is-collapsed' : ''}`}>
              <div className="block-head insp-acc-head">
                <button
                  type="button"
                  className="insp-acc-btn"
                  onClick={() => toggleSec('resources')}
                  aria-expanded={secOpen.resources || showAddRes}
                >
                  <span className="insp-acc-chev">
                    {secOpen.resources || showAddRes ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <span className="block-title">Dev resources</span>
                  {visibleResources.length > 0 && (
                    <span className="insp-acc-count mono">{visibleResources.length}</span>
                  )}
                </button>
                <button
                  className="text-action"
                  onClick={() => {
                    const next = !showAddRes;
                    setShowAddRes(next);
                    if (next) setSecOpen(prev => ({ ...prev, resources: true }));
                  }}
                >
                  {showAddRes ? 'Cancel' : '+ Add link'}
                </button>
              </div>

              {(secOpen.resources || showAddRes) && (
                <>
                  {visibleResources.length > 0 ? (
                    <div className="res-list">
                      {visibleResources.map(res => (
                        <div key={res.id} className="res-row">
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="res-link"
                            title={res.url}
                          >
                            <span className={`res-ic kind-${res.kind}`}>
                              <ResourceIcon kind={res.kind} />
                            </span>
                            <span className="res-text">
                              <span className="res-label">{res.label}</span>
                              <span className="res-meta">
                                {res.kind} · {res.layerId ? 'layer' : 'screen'}
                              </span>
                            </span>
                            <ExternalLink size={11} className="res-ext" />
                          </a>
                          <button
                            className="quiet-icon-btn ann-del"
                            onClick={() => removeResource(res.id)}
                            title="Remove link"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    !showAddRes && (
                      <div className="quiet-empty">
                        Link GitHub files, Storybook stories, or Linear/Jira tickets.
                      </div>
                    )
                  )}

                  {showAddRes && (
                    <form className="res-add-form" onSubmit={addResource}>
                      <input
                        type="text"
                        className="fig-input"
                        placeholder="Paste GitHub, Storybook, or Linear URL…"
                        value={newResUrl}
                        onChange={e => setNewResUrl(e.target.value)}
                        autoFocus
                      />
                      <input
                        type="text"
                        className="fig-input"
                        placeholder="Label (optional)"
                        value={newResLabel}
                        onChange={e => setNewResLabel(e.target.value)}
                      />
                      <div className="res-add-foot">
                        <div className="seg-inline">
                          <button
                            type="button"
                            className={newResScope === 'layer' ? 'active' : ''}
                            onClick={() => setNewResScope('layer')}
                          >
                            This layer
                          </button>
                          <button
                            type="button"
                            className={newResScope === 'screen' ? 'active' : ''}
                            onClick={() => setNewResScope('screen')}
                          >
                            Screen
                          </button>
                        </div>
                        <button type="submit" className="fig-btn-primary sm" disabled={!newResUrl.trim()}>
                          Save
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>

            {/* Interactive Dev Checklist */}
            <div className={`insp-block ${!secOpen.checklist ? 'is-collapsed' : ''}`}>
              <div className="block-head insp-acc-head">
                <button
                  type="button"
                  className="insp-acc-btn"
                  onClick={() => toggleSec('checklist')}
                  aria-expanded={secOpen.checklist}
                >
                  <span className="insp-acc-chev">
                    {secOpen.checklist ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <span className="block-title">Dev checklist</span>
                </button>
                <span className="insp-acc-count mono">
                  {checklist.filter(c => c.done).length}/{checklist.length}
                </span>
              </div>
              {secOpen.checklist && (
                <>
                  {bundle.notes && <p className="quiet-note">{bundle.notes}</p>}
                  <div className="checklist-list">
                    {checklist.map(item => (
                      <label key={item.id} className={`chk-row ${item.done ? 'done' : ''}`}>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => toggleChecklistItem(item.id)}
                        />
                        <span>{item.text}</span>
                      </label>
                    ))}
                  </div>
                  <form className="chk-add-form" onSubmit={addChecklistItem}>
                    <input
                      type="text"
                      placeholder="Add dev task…"
                      value={newTask}
                      onChange={e => setNewTask(e.target.value)}
                    />
                    <button type="submit" className="quiet-icon-btn" title="Add task" disabled={!newTask.trim()}>
                      <Plus size={12} />
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Screen Version History */}
            {(bundle.history?.length || 0) > 0 && (
              <div className={`insp-block ${!secOpen.history ? 'is-collapsed' : ''}`}>
                <div className="block-head insp-acc-head">
                  <button
                    type="button"
                    className="insp-acc-btn"
                    onClick={() => toggleSec('history')}
                    aria-expanded={secOpen.history}
                  >
                    <span className="insp-acc-chev">
                      {secOpen.history ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                    <span className="block-title inline-ic">
                      <History size={11} />
                      <span>Version history</span>
                    </span>
                    <span className="insp-acc-count mono">{bundle.history!.length}</span>
                  </button>
                  <div className="hist-head-actions">
                    {bundle.history!.some(
                      (h, idx) => Boolean(h.rootSnapshot) && !(idx === 0 && h.rootSnapshot === bundle.root)
                    ) && (
                      <button
                        className="text-action"
                        onClick={() => onOpenCompareChanges()}
                      >
                        Compare
                      </button>
                    )}
                  </div>
                </div>
                {secOpen.history && (
                  <div className="hist-list">
                    {bundle.history!.slice(0, 6).map((item, idx) => {
                      const canCompare = Boolean(item.rootSnapshot) && !(idx === 0 && item.rootSnapshot === bundle.root);
                      return (
                        <div key={item.id} className="hist-row">
                          <span className={`hist-dot st-${item.status || 'note'}`} />
                          <div className="hist-body">
                            <div className="hist-summary">{item.summary}</div>
                            <div className="hist-meta-line">
                              <span className="hist-time mono">
                                {new Date(item.timestamp).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric'
                                })}{' '}
                                ·{' '}
                                {new Date(item.timestamp).toLocaleTimeString(undefined, {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              {canCompare && (
                                <button
                                  className="hist-cmp-btn"
                                  onClick={() => onOpenCompareChanges(item.id)}
                                  title="Compare this version to latest"
                                >
                                  Compare
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ================= CODE TAB ================= */}
        {tab === 'code' && (
          <div className="insp-block borderless">
            {compKey && (
              <div className="cc-banner">
                {connectedEntry ? (
                  <>
                    <div className="seg-inline">
                      <button
                        className={codeSourceMode === 'connect' ? 'active' : ''}
                        onClick={() => setCodeSourceMode('connect')}
                      >
                        Code Connect
                      </button>
                      <button
                        className={codeSourceMode === 'auto' ? 'active' : ''}
                        onClick={() => setCodeSourceMode('auto')}
                      >
                        Auto-generated
                      </button>
                    </div>
                    <button className="text-action" onClick={() => setShowConnectModal(true)}>
                      Edit
                    </button>
                  </>
                ) : (
                  <>
                    <span className="cc-banner-hint">Component: {compKey}</span>
                    <button className="text-action" onClick={() => setShowConnectModal(true)}>
                      + Connect to codebase
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="code-top-controls">
              <PopoverSelect
                value={codeTarget}
                options={targetOptions}
                onChange={setCodeTarget}
                className="flex-1"
                ariaLabel="Code language"
              />
              <button
                className="quiet-icon-btn"
                onClick={() => copyText(activeCodeText, 'gen-code', connectedEntry && codeSourceMode === 'connect' ? 'Code Connect snippet' : 'code')}
                title="Copy code"
              >
                {copiedKey === 'gen-code' ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <button className="quiet-icon-btn" onClick={handleDownloadCodeFile} title="Download file">
                <Download size={13} />
              </button>
              <button className="quiet-icon-btn" onClick={handleDownloadProjectZip} title="Download project ZIP">
                <Archive size={13} />
              </button>
            </div>

            {/* AI / MCP Context Strip (Cursor · Claude Code · Codex) */}
            <div className="ai-mcp-bar">
              <div className="ai-mcp-top">
                <span className="ai-mcp-label">
                  <Sparkles size={11} />
                  <span>AI / MCP Context</span>
                </span>
                <div className="seg-inline">
                  <button
                    className={aiScope === 'layer' ? 'active' : ''}
                    onClick={() => setAiScope('layer')}
                    title="Export context for selected layer"
                  >
                    Layer
                  </button>
                  <button
                    className={aiScope === 'screen' ? 'active' : ''}
                    onClick={() => setAiScope('screen')}
                    title="Export context for entire screen"
                  >
                    Screen
                  </button>
                </div>
              </div>
              <div className="ai-mcp-actions">
                <button
                  className="ai-mcp-btn primary"
                  onClick={() =>
                    copyText(
                      buildAiPrompt(bundle, layer, unit, codeTarget, aiScope),
                      'ai-prompt',
                      `AI prompt (${aiScope})`
                    )
                  }
                  title="Copy structured Markdown design context for Cursor, Claude Code, or Codex"
                >
                  {copiedKey === 'ai-prompt' ? <Check size={11} /> : <FileCode2 size={11} />}
                  <span>{copiedKey === 'ai-prompt' ? 'Copied prompt' : 'Copy for AI'}</span>
                </button>
                <button
                  className="ai-mcp-btn"
                  onClick={() =>
                    copyText(
                      buildMcpJson(bundle, layer, unit, aiScope),
                      'ai-mcp-json',
                      `MCP JSON (${aiScope})`
                    )
                  }
                  title="Copy structured MCP JSON context"
                >
                  {copiedKey === 'ai-mcp-json' ? <Check size={11} /> : <FileJson size={11} />}
                  <span>{copiedKey === 'ai-mcp-json' ? 'Copied JSON' : 'MCP JSON'}</span>
                </button>
              </div>
            </div>

            <div className="code-well full">
              <SyntaxCode code={activeCodeText} showLineNumbers />
            </div>
          </div>
        )}

        {/* ================= TOKENS TAB ================= */}
        {tab === 'tokens' && (
          <>
            <div className="insp-block">
              <div className="block-head">
                <span className="block-title">Variables</span>
                <span className="block-sub mono">{bundle.tokens.length}</span>
              </div>
              <button
                className="open-vars-table-btn"
                onClick={() => onOpenVariablesTable()}
              >
                <Table2 size={13} />
                <span>Open variables table</span>
              </button>
            </div>

            {bundle.tokenModes && bundle.tokenModes.length > 0 && (
              <div className="insp-block">
                <div className="block-head">
                  <span className="block-title">Variable mode</span>
                  <div className="seg-inline">
                    {bundle.tokenModes.map(m => (
                      <button
                        key={m}
                        className={activeMode === m ? 'active' : ''}
                        onClick={() => onModeChange(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="insp-block">
              <div className="block-head">
                <span className="block-title">Code syntax</span>
                <span className="block-sub mono">{codeTarget}</span>
              </div>
              <div className="flat-list">
                {bundle.tokens.map(t => {
                  const resolved = (activeMode && t.modes?.[activeMode]) || t.value;
                  const syntax = formatVariableSyntax(t.name, codeTarget, t.category === 'color' ? 'bg' : 'raw');
                  return (
                    <button
                      key={t.name}
                      className="flat-swatch-row clickable"
                      onClick={() => copyText(syntax, `tk-${t.name}`, syntax)}
                      title={`Click to copy ${syntax}`}
                    >
                      {t.category === 'color' ? (
                        <span className="swatch-sq" style={{ background: resolved }} />
                      ) : (
                        <span className="tok-kind mono">{t.category.slice(0, 3)}</span>
                      )}
                      <span className="tok-name mono">{syntax}</span>
                      <span className="tok-val mono">{resolved}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="insp-block">
              <div className="block-head">
                <div className="seg-inline">
                  {(['css', 'tailwind', 'json', 'scss'] as const).map(fmt => (
                    <button
                      key={fmt}
                      className={tokenFmt === fmt ? 'active' : ''}
                      onClick={() => setTokenFmt(fmt)}
                    >
                      {fmt === 'tailwind' ? 'TW4' : fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  className="text-action"
                  onClick={() => copyText(tokensOutput, 'tok-all', 'tokens')}
                >
                  {copiedKey === 'tok-all' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="code-well compact">
                <SyntaxCode code={tokensOutput} showLineNumbers={false} />
              </div>
            </div>
          </>
        )}

        {/* ================= A11Y & ASSETS TAB ================= */}
        {tab === 'a11y' && (
          <>
            <div className="insp-block">
              <div className="block-head">
                <span className="block-title">Accessibility</span>
                <span className="block-sub mono">{a11yIssues} issues</span>
              </div>
              <div className="a11y-flat-list">
                {a11yFindings.map(f => (
                  <button
                    key={f.id}
                    className="a11y-flat-row"
                    onClick={() => onSelectLayer(f.layerId)}
                  >
                    {f.severity === 'error' ? (
                      <XCircle size={13} className="ic-err" />
                    ) : f.severity === 'warning' ? (
                      <AlertTriangle size={13} className="ic-warn" />
                    ) : (
                      <CheckCircle2 size={13} className="ic-ok" />
                    )}
                    <div className="a11y-row-body">
                      <div className="a11y-row-title">{f.title}</div>
                      <div className="a11y-row-layer">{f.layerName}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="insp-block">
              <div className="block-head">
                <span className="block-title">Assets ({bundle.assets?.length || 0})</span>
              </div>
              {bundle.assets && bundle.assets.length > 0 ? (
                <div className="asset-flat-list">
                  {bundle.assets.map(a => (
                    <div key={a.id} className="asset-flat-row">
                      <div className="asset-mini-prev" dangerouslySetInnerHTML={{ __html: a.svg || '' }} />
                      <span className="asset-flat-name">{a.name}.svg</span>
                      {a.svg && (
                        <>
                          <button
                            className="quiet-icon-btn"
                            onClick={() => copyText(a.svg!, `svg-${a.id}`, `${a.name}.svg`)}
                            title="Copy SVG"
                          >
                            {copiedKey === `svg-${a.id}` ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                          <button
                            className="quiet-icon-btn"
                            onClick={() =>
                              downloadBlob(new Blob([a.svg!], { type: 'image/svg+xml' }), `${a.name}.svg`)
                            }
                            title="Download SVG"
                          >
                            <Download size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="quiet-empty">No vector assets in this screen.</div>
              )}
            </div>
          </>
        )}
      </div>

      {showConnectModal &&
        compKey &&
        createPortal(
          <CodeConnectModal
            componentName={compKey}
            initial={connectedEntry}
            onSave={saveCodeConnect}
            onRemove={connectedEntry ? () => removeCodeConnect(compKey) : undefined}
            onClose={() => setShowConnectModal(false)}
          />,
          document.body
        )}

      {showPlayground &&
        compKey &&
        createPortal(
          <ComponentPlaygroundModal
            bundle={bundle}
            layer={layer}
            componentName={compKey}
            initialMode={activeMode}
            codeTarget={codeTarget}
            unit={unit}
            connectedEntry={connectedEntry}
            onClose={() => setShowPlayground(false)}
            onNotify={onNotify}
          />,
          document.body
        )}
    </aside>
  );
};
