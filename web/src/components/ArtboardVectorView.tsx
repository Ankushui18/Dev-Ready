import React, { useMemo } from 'react';
import type { DevReadyBundle, InspectLayer } from '../types';

interface ArtboardVectorViewProps {
  bundle: DevReadyBundle;
  scale: number;
  activeMode?: string;
}

function withOpacity(hex: string, opacity?: number): string {
  if (opacity === undefined || opacity >= 0.99) return hex;
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.round(opacity * 100) / 100})`;
  }
  return hex;
}

function scaledRadius(radius: number | [number, number, number, number] | undefined, scale: number): string | undefined {
  if (radius === undefined) return undefined;
  if (typeof radius === 'number') {
    if (radius >= 900) return '9999px';
    return `${radius * scale}px`;
  }
  return radius.map(r => (r >= 900 ? '9999px' : `${r * scale}px`)).join(' ');
}

/**
 * Native DOM vector renderer scaled directly at `scale` (zoom).
 * Avoids CSS `transform: scale(4)` GPU bitmap upscaling so text, borders,
 * shadows, and SVG icons remain 100% razor-sharp at 400%+ zoom.
 */
export const ArtboardVectorView: React.FC<ArtboardVectorViewProps> = ({
  bundle,
  scale,
  activeMode
}) => {
  // For miniature thumbnails (< 0.55), render at native 1:1 resolution and CSS-scale down
  // so browser minimum font-size clamping never breaks typography or proportions.
  const isMini = scale < 0.55;
  const s = isMini ? 1 : scale;

  const { tokenByName, tokenByDefaultVal } = useMemo(() => {
    const byName = new Map<string, string>();
    const byVal = new Map<string, string>();
    if (activeMode && bundle.tokens.length > 0) {
      for (const t of bundle.tokens) {
        const modeVal = t.modes?.[activeMode];
        if (!modeVal) continue;
        const clean = t.name.replace(/^--/, '');
        byName.set(clean, modeVal);
        byName.set(`--${clean}`, modeVal);
        if (t.category === 'color') {
          byVal.set(t.value.toLowerCase(), modeVal);
        }
      }
    }
    return { tokenByName: byName, tokenByDefaultVal: byVal };
  }, [bundle.tokens, activeMode]);

  const resolveColor = (color?: string, token?: string): string | undefined => {
    if (token && tokenByName.has(token)) return tokenByName.get(token);
    if (color && tokenByDefaultVal.has(color.toLowerCase())) {
      return tokenByDefaultVal.get(color.toLowerCase());
    }
    return color;
  };

  const resolveFill = (node: InspectLayer): string | undefined => {
    const f = node.fills?.[0];
    if (!f) return undefined;
    if (f.type === 'LINEAR_GRADIENT' && f.gradient) return f.gradient;
    const resolved = resolveColor(f.color, f.token);
    if (f.type === 'SOLID' && resolved) {
      return withOpacity(resolved, f.opacity);
    }
    return undefined;
  };

  const resolveShadow = (node: InspectLayer): string | undefined => {
    const shadows = (node.effects || []).filter(e => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW');
    if (!shadows.length) return undefined;
    return shadows
      .map(
        sh =>
          `${sh.type === 'INNER_SHADOW' ? 'inset ' : ''}${(sh.x || 0) * s}px ${(sh.y || 0) * s}px ${sh.blur * s}px ${(sh.spread || 0) * s}px ${sh.color || 'rgba(0,0,0,0.18)'}`
      )
      .join(', ');
  };

  const renderNode = (node: InspectLayer, parentX: number, parentY: number): React.ReactNode => {
    if (node.visible === false) return null;
    const fill = resolveFill(node);
    const stroke = node.strokes?.[0];
    const strokeColor = stroke ? resolveColor(stroke.color, stroke.token) || stroke.color : undefined;

    const style: React.CSSProperties = {
      position: 'absolute',
      left: (node.x - parentX) * s,
      top: (node.y - parentY) * s,
      width: node.width * s,
      height: node.height * s,
      boxSizing: 'border-box',
      borderRadius: scaledRadius(node.radius, s),
      opacity: node.opacity,
      boxShadow: resolveShadow(node),
      overflow: node.clipsContent ? 'hidden' : undefined
    };

    if (stroke && strokeColor) {
      style.border = `${Math.max(1, stroke.width * s)}px ${stroke.dash ? 'dashed' : 'solid'} ${strokeColor}`;
    }

    const layerBlur = (node.effects || []).find(e => e.type === 'LAYER_BLUR');
    if (layerBlur && layerBlur.blur > 0) {
      style.filter = `blur(${layerBlur.blur * s}px)`;
    }
    const bgBlur = (node.effects || []).find(e => e.type === 'BACKGROUND_BLUR');
    if (bgBlur && bgBlur.blur > 0) {
      const blurPx = `blur(${bgBlur.blur * s}px)`;
      style.backdropFilter = blurPx;
      style.WebkitBackdropFilter = blurPx;
    }

    if (node.type === 'TEXT') {
      style.color = fill || '#111827';
      if (node.typography) {
        style.fontFamily = `'${node.typography.fontFamily}', Inter, system-ui, sans-serif`;
        style.fontSize = node.typography.fontSize * s;
        style.fontWeight = node.typography.fontWeight;
        style.lineHeight = `${node.typography.lineHeight * s}px`;
        style.display = 'flex';
        style.alignItems = 'center';
        if (node.typography.letterSpacing) {
          style.letterSpacing = `${node.typography.letterSpacing * s}px`;
        }
        if (node.typography.textAlign === 'CENTER') {
          style.justifyContent = 'center';
          style.textAlign = 'center';
        } else if (node.typography.textAlign === 'RIGHT') {
          style.justifyContent = 'flex-end';
          style.textAlign = 'right';
        }
      }
      return (
        <div key={node.id} style={style}>
          {node.text || ''}
        </div>
      );
    }

    if (fill) {
      if (fill.startsWith('linear-gradient')) {
        style.background = fill;
      } else {
        style.backgroundColor = fill;
      }
    }

    if (node.svg) {
      return (
        <div
          key={node.id}
          className="vector-svg-host"
          style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          dangerouslySetInnerHTML={{ __html: node.svg }}
        />
      );
    }

    return (
      <div key={node.id} style={style}>
        {node.children?.map(child => renderNode(child, node.x, node.y))}
      </div>
    );
  };

  const rootBg =
    bundle.backgroundColor === 'transparent'
      ? 'transparent'
      : resolveColor(bundle.backgroundColor, bundle.root.fills?.[0]?.token) || bundle.backgroundColor;

  if (isMini) {
    return (
      <div
        style={{
          position: 'relative',
          width: bundle.width * scale,
          height: bundle.height * scale,
          overflow: 'hidden'
        }}
      >
        <div
          className="artboard-vector-root"
          style={{
            width: bundle.width,
            height: bundle.height,
            backgroundColor: rootBg,
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }}
        >
          {renderNode(bundle.root, bundle.root.x, bundle.root.y)}
        </div>
      </div>
    );
  }

  return (
    <div
      className="artboard-vector-root"
      style={{
        width: bundle.width * scale,
        height: bundle.height * scale,
        backgroundColor: rootBg
      }}
    >
      {renderNode(bundle.root, bundle.root.x, bundle.root.y)}
    </div>
  );
};
