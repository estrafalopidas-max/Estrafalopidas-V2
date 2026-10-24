import React from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export interface MatrixZoomControlsProps {
  zoomLevel: number;
  onZoomChange: (level: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  className?: string;
  isFloating?: boolean;
}

export const MatrixZoomControls: React.FC<MatrixZoomControlsProps> = ({
  zoomLevel,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  className = '',
  isFloating = false,
}) => {
  return (
    <div
      className={`inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-md rounded-2xl px-2.5 py-1.5 text-slate-700 select-none ${
        isFloating ? 'ring-1 ring-slate-900/5 shadow-xl' : ''
      } ${className}`}
      role="region"
      aria-label="Controles de escala y zoom"
    >
      <div className="flex items-center space-x-1 pr-1 border-r border-slate-200">
        <ZoomOut className="w-3.5 h-3.5 text-slate-400" />
      </div>

      {/* Botón [-] */}
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoomLevel <= 50}
        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 disabled:opacity-40 transition font-bold text-base flex items-center justify-center leading-none"
        title="Reducir escala (-5%)"
        aria-label="Reducir escala"
      >
        <span>−</span>
      </button>

      {/* Deslizador Slider <input type="range" min="50" max="150" step="5"> */}
      <div className="flex items-center gap-1">
        <input
          type="range"
          min="50"
          max="150"
          step="5"
          value={zoomLevel}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-16 xl:w-20 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-villa-blue focus:outline-none"
          title={`Escala actual: ${zoomLevel}%`}
          aria-label="Ajustar nivel de zoom"
        />
      </div>

      {/* Botón [+] */}
      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoomLevel >= 150}
        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 disabled:opacity-40 transition font-bold text-base flex items-center justify-center leading-none"
        title="Aumentar escala (+5%)"
        aria-label="Aumentar escala"
      >
        <span>+</span>
      </button>

      {/* Indicador / Reset al 100% */}
      <button
        type="button"
        onClick={onResetZoom}
        className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1 ${
          zoomLevel === 100
            ? 'text-slate-600 bg-slate-100'
            : 'text-villa-blue bg-blue-50 border border-blue-200 hover:bg-blue-100'
        }`}
        title="Clic para restablecer escala a 100%"
      >
        <span>{zoomLevel}%</span>
        {zoomLevel !== 100 && <RotateCcw className="w-2.5 h-2.5" />}
      </button>
    </div>
  );
};
