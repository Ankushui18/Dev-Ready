import React from 'react';
import type { InspectLayer } from '../types';

interface CanvasRulersProps {
  viewportWidth: number;
  viewportHeight: number;
  offsetLeft?: number;
  offsetRight?: number;
  boardLeft: number;
  boardTop: number;
  zoom: number;
  selectedLayer: InspectLayer;
  showSelection?: boolean;
  cursorArtboard: { x: number; y: number } | null;
}

function pickStep(zoom: number): number {
  const pxPer50 = 50 * zoom;
  if (pxPer50 >= 180) return 10;
  if (pxPer50 >= 90) return 25;
  if (pxPer50 >= 48) return 50;
  if (pxPer50 >= 22) return 100;
  return 200;
}

export const CanvasRulers: React.FC<CanvasRulersProps> = ({
  viewportWidth,
  viewportHeight,
  offsetLeft = 0,
  offsetRight = 0,
  boardLeft,
  boardTop,
  zoom,
  selectedLayer,
  showSelection = true,
  cursorArtboard
}) => {
  const step = pickStep(zoom);
  const subStep = step / 5;
  const topOriginX = offsetLeft + 20;

  // Horizontal ticks (in artboard coords visible between floating sidebars)
  const startX = Math.floor(((topOriginX - boardLeft) / zoom) / step) * step;
  const endX = Math.ceil((((viewportWidth - offsetRight) - boardLeft) / zoom) / step) * step;
  const hTicks: number[] = [];
  for (let v = startX; v <= endX; v += step) hTicks.push(v);

  // Vertical ticks
  const startY = Math.floor(((20 - boardTop) / zoom) / step) * step;
  const endY = Math.ceil(((viewportHeight - boardTop) / zoom) / step) * step;
  const vTicks: number[] = [];
  for (let v = startY; v <= endY; v += step) vTicks.push(v);

  // Coordinates relative to each ruler's SVG origin
  const selLeftPx = boardLeft - topOriginX + selectedLayer.x * zoom;
  const selWidthPx = selectedLayer.width * zoom;
  const selTopPx = boardTop - 20 + selectedLayer.y * zoom;
  const selHeightPx = selectedLayer.height * zoom;

  return (
    <>
      {/* Corner Square (aligned beside floating left sidebar) */}
      <div className="ruler-corner" style={{ left: offsetLeft }} aria-hidden="true" />

      {/* Top Horizontal Ruler */}
      <div className="ruler-top" style={{ left: topOriginX, right: offsetRight }} aria-hidden="true">
        <svg width="100%" height="20">
          {/* Selected X-span band */}
          {showSelection && (
            <>
              <rect
                x={selLeftPx}
                y={0}
                width={Math.max(1, selWidthPx)}
                height={20}
                fill="rgba(13, 153, 255, 0.18)"
              />
              <line x1={selLeftPx} y1={0} x2={selLeftPx} y2={20} stroke="#0D99FF" strokeWidth={1} />
              <line x1={selLeftPx + selWidthPx} y1={0} x2={selLeftPx + selWidthPx} y2={20} stroke="#0D99FF" strokeWidth={1} />
            </>
          )}

          {hTicks.map(v => {
            const x = boardLeft - topOriginX + v * zoom;
            return (
              <g key={`hx-${v}`}>
                <line x1={x} y1={12} x2={x} y2={20} className="ruler-tick" />
                <text x={x + 3} y={10} className="ruler-num">
                  {v}
                </text>
                {[1, 2, 3, 4].map(sub => {
                  const sx = boardLeft - topOriginX + (v + sub * subStep) * zoom;
                  return <line key={sub} x1={sx} y1={16} x2={sx} y2={20} className="ruler-subtick" />;
                })}
              </g>
            );
          })}

          {cursorArtboard && (
            <line
              x1={boardLeft - topOriginX + cursorArtboard.x * zoom}
              y1={0}
              x2={boardLeft - topOriginX + cursorArtboard.x * zoom}
              y2={20}
              stroke="#FF3B5C"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>

      {/* Left Vertical Ruler */}
      <div className="ruler-left" style={{ left: offsetLeft }} aria-hidden="true">
        <svg width="20" height="100%">
          {/* Selected Y-span band */}
          {showSelection && (
            <>
              <rect
                x={0}
                y={selTopPx}
                width={20}
                height={Math.max(1, selHeightPx)}
                fill="rgba(13, 153, 255, 0.18)"
              />
              <line x1={0} y1={selTopPx} x2={20} y2={selTopPx} stroke="#0D99FF" strokeWidth={1} />
              <line x1={0} y1={selTopPx + selHeightPx} x2={20} y2={selTopPx + selHeightPx} stroke="#0D99FF" strokeWidth={1} />
            </>
          )}

          {vTicks.map(v => {
            const y = boardTop - 20 + v * zoom;
            return (
              <g key={`vy-${v}`}>
                <line x1={12} y1={y} x2={20} y2={y} className="ruler-tick" />
                <text
                  x={9}
                  y={y + 3}
                  className="ruler-num"
                  transform={`rotate(-90 9 ${y + 3})`}
                  textAnchor="end"
                >
                  {v}
                </text>
                {[1, 2, 3, 4].map(sub => {
                  const sy = boardTop - 20 + (v + sub * subStep) * zoom;
                  return <line key={sub} x1={16} y1={sy} x2={20} y2={sy} className="ruler-subtick" />;
                })}
              </g>
            );
          })}

          {cursorArtboard && (
            <line
              x1={0}
              y1={boardTop - 20 + cursorArtboard.y * zoom}
              x2={20}
              y2={boardTop - 20 + cursorArtboard.y * zoom}
              stroke="#FF3B5C"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>
    </>
  );
};
