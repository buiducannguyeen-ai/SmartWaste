import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, X, CheckCircle2, RotateCcw, HelpCircle, Eye, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { DuplicateAlertInfo } from '../types';

interface DuplicateWarningToastProps {
  alert: DuplicateAlertInfo | null;
  onDismiss: () => void;
  onConfirmDroppedInBin: () => void;
  onOpenGuide: () => void;
}

export const DuplicateWarningToast: React.FC<DuplicateWarningToastProps> = ({
  alert,
  onDismiss,
  onConfirmDroppedInBin,
  onOpenGuide,
}) => {
  const [showEvidence, setShowEvidence] = useState(true);

  if (!alert) return null;

  const similarityPercent = Math.round(alert.similarity * 100);
  const secondsAgo = Math.max(1, Math.round(alert.timeSinceLastScanMs / 1000));
  const isExact = alert.isExactFileMatch || similarityPercent >= 98;
  const isScreenSpoof = alert.isScreenSpoof;

  return (
    <div
      id="duplicate-warning-toast"
      className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 w-[94%] max-w-xl animate-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div className="relative overflow-hidden rounded-3xl border-2 border-rose-500/90 bg-gradient-to-br from-rose-950/95 via-slate-900/95 to-red-950/95 backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-rose-950/70 ring-4 ring-rose-500/20">
        {/* Anti-cheat Top HUD Bar */}
        <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-rose-500/30">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-black tracking-wider uppercase text-rose-300 font-mono flex items-center gap-1.5">
              <span>AI ANTI-CHEAT</span>
              <span className="text-rose-500">&bull;</span>
              <span>CHỐNG GIAN LẬN QUÉT LẶP</span>
            </span>
          </div>

          <button
            onClick={onDismiss}
            className="p-1.5 rounded-xl text-rose-400 hover:text-white hover:bg-rose-900/50 transition-colors"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Header Alert */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-rose-500/20 border-2 border-rose-500/50 flex items-center justify-center text-rose-400 shadow-inner">
            <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-rose-500 text-white font-black text-xs uppercase tracking-tight shadow">
                TỪ CHỐI TÍCH ĐIỂM (+0 ĐIỂM)
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/30 border border-rose-500/50 text-rose-200 font-bold font-mono">
                {alert.detectionTier === 'screen_spoof' || isScreenSpoof
                  ? 'GIAN LẬN MÀN HÌNH'
                  : alert.detectionTier === 'exact_file' || isExact
                  ? 'TRÙNG LẶP 100%'
                  : alert.detectionTier === 'modified_image'
                  ? `ẢNH CẮT CÚP / CHỈNH SÁNG ${similarityPercent}%`
                  : alert.detectionTier === 'same_physical_object'
                  ? `TRÙNG VẬT THỂ ${similarityPercent}%`
                  : `NGHI VẤN ${similarityPercent}%`}
              </span>
            </div>

            <h3 className="text-base font-extrabold text-white">
              {alert.detectionTier === 'screen_spoof' || isScreenSpoof
                ? 'Phát Hiện Chụp Lại Từ Màn Hình Thiết Bị Điện Tử!'
                : alert.detectionTier === 'exact_file' || isExact
                ? 'Phát Hiện Sử Dụng Lại Cùng 1 Tệp Ảnh!'
                : alert.detectionTier === 'modified_image'
                ? 'Phát Hiện Ảnh Đã Qua Cắt Cúp / Chỉnh Sáng Từ Ảnh Cũ!'
                : `Phát Hiện Vật Thể "${alert.itemName}" Vừa Được Quét Trước Đó!`}
            </h3>

            <p className="text-xs text-rose-100/90 leading-relaxed">
              {alert.reason}
            </p>

            {alert.technicalDetails && (
              <div className="pt-1 flex items-center gap-2 flex-wrap text-[10px] font-mono text-rose-200/80">
                <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-rose-500/40">
                  dHash: {Math.round((alert.technicalDetails.dHashSimilarity || 0) * 100)}%
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-rose-500/40">
                  Màu sắc: {Math.round((alert.technicalDetails.colorSimilarity || 0) * 100)}%
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900/80 border border-rose-500/40">
                  Trọng tâm: {Math.round((alert.technicalDetails.centerSimilarity || 0) * 100)}%
                </span>
                {alert.technicalDetails.screenSpoofScore > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-amber-300">
                    Moiré: {Math.round(alert.technicalDetails.screenSpoofScore * 100)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Side-by-Side Visual Evidence (Comparison) */}
        {alert.matchedRecord && (
          <div className="mt-4 pt-3 border-t border-rose-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <span>BẰNG CHỨNG ĐỐI CHỨNG QUANG HỌC (DHASH & CHECKSUM):</span>
              </span>
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono"
              >
                {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>{showEvidence ? 'Thu gọn' : 'Xem ảnh'}</span>
              </button>
            </div>

            {showEvidence && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-950/80 border border-rose-500/30">
                {/* Left: Current capture */}
                <div className="space-y-1.5 text-center">
                  <div className="text-[10px] font-bold text-rose-400 uppercase">
                    1. Ảnh vừa đưa vào quét
                  </div>
                  <div className="w-full aspect-video rounded-xl bg-slate-900 overflow-hidden border border-rose-500/40 relative flex items-center justify-center">
                    {alert.currentThumbnail ? (
                      <img
                        src={alert.currentThumbnail}
                        alt="Current capture"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-700" />
                    )}
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-rose-600 text-white font-mono text-[9px] font-bold">
                      VỪA QUÉT
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    Độ khớp: <strong className="text-rose-400">{similarityPercent}%</strong>
                  </div>
                </div>

                {/* Right: Original stored image */}
                <div className="space-y-1.5 text-center">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase">
                    2. Mẫu gốc đã nhận điểm
                  </div>
                  <div className="w-full aspect-video rounded-xl bg-slate-900 overflow-hidden border border-emerald-500/40 relative flex items-center justify-center">
                    {alert.matchedRecord.thumbnail ? (
                      <img
                        src={alert.matchedRecord.thumbnail}
                        alt="Stored reference"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-700" />
                    )}
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[9px] font-bold">
                      ĐÃ LƯU KHO
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300 truncate">
                    {alert.matchedRecord.itemName} ({secondsAgo < 60 ? `${secondsAgo}s trước` : `${Math.round(secondsAgo / 60)}p trước`})
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Suggestion & Rule reminder */}
        <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-rose-500/30 text-[11px] text-slate-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>
            {alert.suggestedAction || 'Quy chế: Mỗi vật thể rác thải thật chỉ được tích điểm 1 lần duy nhất trong toàn bộ phiên thi.'}
          </span>
        </div>

        {/* Technical Transparency Note (Requirement 10) */}
        <div className="mt-2.5 p-2 rounded-xl bg-slate-950/40 border border-slate-800 text-[10px] text-slate-400 leading-relaxed font-sans">
          <strong className="text-slate-300">Minh bạch thuật toán STEM:</strong> Phòng thủ đa tầng gồm Dấu vân tay quang học, Phổ Moiré tần số cao và Sổ kiểm toán máy chủ. Màn hình OLED góc chụp thẳng không viền hoặc ảnh in chất lượng cao có thể làm giảm độ nhạy quang học; cuộc thi thực tế luôn kết hợp sự giám sát trực tiếp của Ban Giám Khảo.
        </div>

        {/* Action Controls */}
        <div className="mt-4 flex items-center justify-between gap-2 flex-wrap pt-1">
          <button
            onClick={onConfirmDroppedInBin}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-all active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Mở Khóa Quét Lại (Bỏ Rác Vào Thùng Hoặc Đổi Góc)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenGuide}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Xem Thuật Toán AI</span>
            </button>

            <button
              onClick={onDismiss}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs transition-colors border border-slate-700"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
