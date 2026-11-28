import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { CodeConnectEntry, CodeTarget, DevReadyBundle, InspectLayer, UnitMode } from '../types';
import { generateCode } from '../lib/codegen';
import { ArtboardVectorView } from './ArtboardVectorView';

type InteractiveState = 'default' | 'hover' | 'focus' | 'active' | 'disabled';
type StageSurface = 'dark' | 'light' | 'checker';

interface ComponentPlaygroundModalProps {
  bundle: DevReadyBundle;
  layer: InspectLayer;
  componentName: string;
  initialMode: string;
  codeTarget: CodeTarget;
  unit: UnitMode;
  connectedEntry?: CodeConnectEntry;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ComponentPlaygroundModal: React.FC<ComponentPlaygroundModalProps> = ({
  bundle,
  layer,
  componentName,
  initialMode,
  codeTarget,
  unit,
  connectedEntry,
  onClose,
  onNotify
}) => {
  const [state, setState] = useState<InteractiveState>('default');
  const [mode, setMode] = useState<string>(initialMode || bundle.tokenModes?.[0] || '');
  const [surface, setSurface] = useState<StageSurface>('dark');
  const [scale, setScale] = useState<number>(layer.width <= 260 ? 1.5 : 1);
  const [copied, setCopied] = useState(false);

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

  // Build an isolated single-component bundle without touching the original screen
  const isolatedBundle = useMemo<DevReadyBundle>(
    () => ({
      ...bundle,
      width: Math.max(1, Math.round(layer.width)),
      height: Math.max(1, Math.round(layer.height)),
      backgroundColor: 'transparent',
      root: layer
    }),
    [bundle, layer]
  );

  const snippet = useMemo(() => {
    if (connectedEntry) {
      return `${connectedEntry.importPath}\n\n${connectedEntry.snippet}`;
    }
    return generateCode(layer, codeTarget, unit);
  }, [connectedEntry, layer, codeTarget, unit]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet).catch(() => {});
    setCopied(true);
    onNotify(`Copied ${componentName} snippet`);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fig-modal pg-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Component playground — ${componentName}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="fig-modal-head">
          <h2>Playground — {componentName}</h2>
          <button className="fig-modal-close" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Isolated Sandbox Stage — razor-sharp native vector scaling */}
        <div className={`pg-stage surf-${surface}`}>
          <div
            className={`pg-comp-wrap state-${state}`}
            style={{
              width: layer.width * scale,
              height: layer.height * scale
            }}
          >
            <ArtboardVectorView
              bundle={isolatedBundle}
              scale={scale}
              activeMode={mode || undefined}
            />
          </div>
          <span className="pg-dim-badge mono">
            {Math.round(layer.width)} × {Math.round(layer.height)} · {state}
          </span>
        </div>

        {/* Interactive Controls */}
        <div className="pg-controls">
          <div className="pg-ctrl-row">
            <span className="pg-ctrl-label">State</span>
            <div className="seg-inline">
              {(['default', 'hover', 'focus', 'active', 'disabled'] as InteractiveState[]).map(st => (
                <button key={st} className={state === st ? 'active' : ''} onClick={() => setState(st)}>
                  {st[0].toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="pg-ctrl-row">
            <span className="pg-ctrl-label">Preview</span>
            <div className="pg-ctrl-right">
              {bundle.tokenModes && bundle.tokenModes.length > 1 && (
                <div className="seg-inline">
                  {bundle.tokenModes.map(m => (
                    <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
              <div className="seg-inline">
                {(['dark', 'light', 'checker'] as StageSurface[]).map(s => (
                  <button key={s} className={surface === s ? 'active' : ''} onClick={() => setSurface(s)}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <div className="seg-inline">
                {[1, 1.5, 2].map(sc => (
                  <button key={sc} className={scale === sc ? 'active' : ''} onClick={() => setScale(sc)}>
                    {sc}×
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="fig-modal-foot">
          <span className="fig-foot-meta">
            {connectedEntry ? 'Using Code Connect mapping' : 'Isolated preview · Design unchanged'}
          </span>
          <div className="fig-foot-actions">
            <button className="fig-btn-primary" onClick={handleCopy}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy snippet'}</span>
            </button>
            <button className="fig-btn-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
