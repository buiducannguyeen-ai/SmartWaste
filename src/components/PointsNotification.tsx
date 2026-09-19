import React, { useEffect } from 'react';
import { Sparkles, Check, ArrowRight, X } from 'lucide-react';
import { WasteClassificationResult } from '../types';

interface PointsNotificationProps {
  result: WasteClassificationResult | null;
  onDismiss: () => void;
}

export const PointsNotification: React.FC<PointsNotificationProps> = ({ result, onDismiss }) => {
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [result, onDismiss]);

  if (!result) return null;

  const getTheme = () => {
    switch (result.category) {
      case 'organic':
        return {
          bg: 'from-emerald-950/95 via-slate-900/95 to-emerald-900/80',
          border: 'border-emerald-500',
          glow: 'shadow-emerald-500/20',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
          pointColor: 'text-emerald-400',
          binBadge: 'bg-emerald-600 text-white',
          binText: 'Thùng Xanh Lá (Rác Hữu Cơ)',
          tag: 'RÁC HỮU CƠ',
        };
      case 'recyclable':
        return {
          bg: 'from-amber-950/95 via-slate-900/95 to-cyan-950/80',
          border: 'border-amber-500',
          glow: 'shadow-amber-500/20',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
          pointColor: 'text-amber-400',
          binBadge: 'bg-amber-500 text-slate-950',
          binText: 'Thùng Vàng / Trắng (Rác Tái Chế)',
          tag: 'RÁC TÁI CHẾ',
        };
      case 'inorganic':
      default:
        return {
          bg: 'from-orange-950/95 via-slate-900/95 to-rose-950/80',
          border: 'border-orange-500',
          glow: 'shadow-orange-500/20',
          badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
          pointColor: 'text-orange-400',
          binBadge: 'bg-orange-600 text-white',
          binText: 'Thùng Cam / Xám (Rác Vô Cơ Còn Lại)',
          tag: 'RÁC VÔ CƠ',
        };
    }
  };

  const theme = getTheme();

  return (
    <div
      id="notification-points-popup"
      className="fixed top-18 sm:top-20 left-1/2 transform -translate-x-1/2 z-50 w-[92%] max-w-lg animate-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border-2 ${theme.border} bg-gradient-to-br ${theme.bg} backdrop-blur-xl p-4 sm:p-5 shadow-2xl ${theme.glow}`}
      >
        {/* Sparkle decorative particles */}
        <div className="absolute top-2 right-12 text-amber-300 animate-pulse text-xs flex items-center gap-1 font-mono">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI ACCURACY: {Math.round(result.confidence * 100)}%</span>
        </div>

        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          {/* Points Orb */}
          <div className="flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-950/80 border border-slate-700/80 shadow-inner">
            <span className="text-[10px] uppercase font-bold text-slate-400">TÍCH LUỸ</span>
            <span className={`text-2xl sm:text-3xl font-black ${theme.pointColor} tracking-tighter leading-none my-0.5`}>
              +{result.points}
            </span>
            <span className="text-[10px] font-bold text-slate-300">ĐIỂM</span>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${theme.badgeBg}`}>
                {theme.tag}
              </span>
              <span className="text-xs text-slate-300 font-bold truncate">
                {result.itemName}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 mb-2">
              {result.description}
            </p>

            {/* Target Bin Action */}
            <div className="flex items-center gap-1.5 text-xs bg-slate-950/60 rounded-lg px-2.5 py-1.5 border border-slate-800">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${theme.binBadge}`}>
                QUY TRÌNH
              </span>
              <span className="text-slate-200 font-medium truncate flex-1">
                {theme.binText}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            </div>

            {/* Eco Impact Note */}
            {result.ecoImpact && (
              <div className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                <Check className="w-3 h-3 text-emerald-400" />
                <span>{result.ecoImpact}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
