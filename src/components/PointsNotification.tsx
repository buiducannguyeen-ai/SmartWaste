import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Check,
  ArrowRight,
  X,
  RotateCcw,
  AlertTriangle,
  Send,
  HelpCircle,
  Info,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { WasteClassificationResult, WasteCategory } from '../types';
import { submitMisclassificationFeedback } from '../lib/serverSync';
import { playClickSound, playWarningSound } from '../utils/audio';

interface PointsNotificationProps {
  result: WasteClassificationResult | null;
  onDismiss: () => void;
  onRescan?: () => void;
  currentUserId?: string;
  currentUserName?: string;
}

export const PointsNotification: React.FC<PointsNotificationProps> = ({
  result,
  onDismiss,
  onRescan,
  currentUserId,
  currentUserName,
}) => {
  // Misclassification feedback reporting state
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [selectedCorrectCategory, setSelectedCorrectCategory] = useState<WasteCategory>('recyclable');
  const [userNote, setUserNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string | null>(null);

  // Auto-dismiss: don't dismiss when user is reporting, and keep uncertain longer (12s)
  useEffect(() => {
    if (!result || isReportOpen) return;
    const duration = result.isUncertain ? 12000 : 7000;
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [result, onDismiss, isReportOpen]);

  // Reset state on new result
  useEffect(() => {
    setIsReportOpen(false);
    setUserNote('');
    setReportSuccessMsg(null);
    setIsSubmitting(false);
  }, [result]);

  if (!result) return null;

  const isUncertain = Boolean(result.isUncertain);

  const getTheme = () => {
    if (isUncertain) {
      return {
        bg: 'from-amber-950/95 via-slate-900/95 to-slate-950/95',
        border: 'border-amber-400/80',
        glow: 'shadow-amber-500/20',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
        pointColor: 'text-amber-400',
        binBadge: 'bg-amber-600 text-slate-950',
        binText: 'Chưa xác định chắc chắn thùng rác',
        tag: 'AI CHƯA CHẮC CHẮN',
      };
    }

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
  const confidencePercent = Math.round((result.confidence ?? 0.5) * 100);

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    playClickSound();

    try {
      const res = await submitMisclassificationFeedback({
        userId: currentUserId,
        userName: currentUserName,
        itemName: result.itemName,
        aiCategory: result.category,
        aiConfidence: result.confidence,
        userSuggestedCategory: selectedCorrectCategory,
        userNote,
        thumbnail: result.rawImage ? result.rawImage.slice(0, 15000) : undefined,
      });

      if (res.success) {
        setReportSuccessMsg(
          'Đã tiếp nhận báo cáo của bạn để ban chuyên môn STEM xem xét đánh giá. Ý kiến người dùng được lưu trữ độc lập để đối chiếu, không tự động coi là nhãn chuẩn hay dùng để tự nâng độ chính xác AI.'
        );
        setTimeout(() => {
          onDismiss();
        }, 3500);
      } else {
        alert(res.error || 'Không thể gửi báo cáo, vui lòng thử lại.');
        setIsSubmitting(false);
      }
    } catch {
      alert('Lỗi kết nối khi gửi báo cáo.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="notification-points-popup"
      className="fixed top-18 sm:top-20 left-1/2 transform -translate-x-1/2 z-50 w-[94%] max-w-lg animate-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border-2 ${theme.border} bg-gradient-to-br ${theme.bg} backdrop-blur-xl p-4 sm:p-5 shadow-2xl ${theme.glow}`}
      >
        {/* Top Header Row: AI Confidence & Close Button */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold text-slate-200">
              Độ tin cậy AI: <span className="text-cyan-300 font-black">{confidencePercent}%</span>
            </span>
            <span
              className="text-[10px] text-slate-400 italic hidden sm:inline"
              title="Ước lượng của mô hình - không phải kết quả đo lường độ chính xác thực tế"
            >
              (Ước lượng mô hình)
            </span>
          </div>

          <button
            onClick={onDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Normal Notification or Uncertain Alert View */}
        {!isReportOpen ? (
          <div>
            <div className="flex items-start gap-4">
              {/* Points Orb */}
              <div
                className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-950/90 border ${
                  isUncertain ? 'border-amber-500/60' : 'border-slate-700/80'
                } shadow-inner`}
              >
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  {isUncertain ? 'TẠM KHÓA' : 'TÍCH LUỸ'}
                </span>
                <span
                  className={`text-2xl sm:text-3xl font-black ${theme.pointColor} tracking-tighter leading-none my-0.5`}
                >
                  +{result.points}
                </span>
                <span className="text-[10px] font-bold text-slate-300">ĐIỂM</span>
              </div>

              {/* Details & Uncertain Notice */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${theme.badgeBg}`}
                  >
                    {theme.tag}
                  </span>
                  <span className="text-xs text-slate-200 font-bold truncate">
                    {result.itemName}
                  </span>
                </div>

                {/* Specific uncertainty text required by prompt */}
                {isUncertain ? (
                  <div className="p-2.5 rounded-xl bg-amber-950/70 border border-amber-500/60 my-2 text-xs text-amber-200 leading-relaxed font-medium">
                    <p className="flex items-start gap-1.5">
                      <HelpCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>
                        AI chưa chắc chắn về vật thể này. Vui lòng chụp lại ở nơi đủ ánh sáng hoặc chọn báo cáo AI nhận nhầm.
                      </span>
                    </p>
                    <div className="mt-1 text-[10px] text-amber-300/80 font-mono">
                      &bull; Trường hợp chưa chắc chắn không được tự động cộng điểm.
                    </div>
                  </div>
                ) : (
                  <>
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

                    {/* Preparation Steps Checklist Summary */}
                    {!isUncertain && result.preparationSteps && result.preparationSteps.length > 0 && (
                      <div className="mt-2.5 p-2 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Các bước xử lý đã xác nhận:</span>
                        </div>
                        {result.preparationSteps.map((step, idx) => (
                          <div key={step.id || idx} className="flex items-center gap-1.5 text-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                            <span className="truncate">{step.instruction}</span>
                            {step.status === 'not_applicable' && (
                              <span className="text-[10px] text-slate-500 italic">(Không áp dụng)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Special Handling Warning */}
                    {(result.isHazardousOrSpecial || result.specialHandlingNotice) && (
                      <div className="mt-2 p-2 rounded-xl bg-rose-950/70 border border-rose-500/50 text-[11px] text-rose-200 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                        <span className="truncate">Thu gom riêng: {result.specialHandlingNotice || 'Pin / rác nguy hại cần điểm thu gom riêng'}</span>
                      </div>
                    )}
                  </>
                )}

                {/* Eco Impact Note */}
                {!isUncertain && result.ecoImpact && (
                  <div className="mt-1.5 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>{result.ecoImpact}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons: "Chụp lại" and "AI nhận nhầm" */}
            <div className="mt-3.5 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                id="btn-notification-rescan"
                onClick={() => {
                  playClickSound();
                  onDismiss();
                  if (onRescan) onRescan();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold text-xs shadow transition-all active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                <span>Chụp lại</span>
              </button>

              <button
                type="button"
                id="btn-notification-report-wrong"
                onClick={() => {
                  playClickSound();
                  setIsReportOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/60 font-bold text-xs shadow transition-all active:scale-95 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>AI nhận nhầm</span>
              </button>
            </div>
          </div>
        ) : (
          /* Report Misclassification Form */
          <div className="animate-in fade-in duration-200">
            {reportSuccessMsg ? (
              <div className="p-4 rounded-xl bg-emerald-950/90 border border-emerald-500 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="text-xs font-black text-emerald-200 uppercase tracking-wide">
                  Đã Tiếp Nhận Báo Cáo
                </h4>
                <p className="text-xs text-slate-200 leading-relaxed font-medium">
                  {reportSuccessMsg}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitReport} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-black text-slate-100 uppercase tracking-wide">
                      Báo Cáo AI Nhận Nhầm: {result.itemName}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Hiện tại: {result.category}
                  </span>
                </div>

                <div className="text-xs text-slate-300">
                  <p className="font-semibold text-slate-200 mb-1.5">
                    Theo bạn, vật thể này chính xác thuộc nhóm rác nào?
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Organic */}
                    <button
                      type="button"
                      onClick={() => setSelectedCorrectCategory('organic')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        selectedCorrectCategory === 'organic'
                          ? 'bg-emerald-600 text-white border-emerald-300 shadow-md ring-2 ring-emerald-400'
                          : 'bg-slate-900 text-emerald-300 border-slate-700 hover:border-emerald-500/60'
                      }`}
                    >
                      <div className="text-base">🍌</div>
                      <div className="text-[11px] font-black mt-0.5">Hữu cơ</div>
                    </button>

                    {/* Recyclable */}
                    <button
                      type="button"
                      onClick={() => setSelectedCorrectCategory('recyclable')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        selectedCorrectCategory === 'recyclable'
                          ? 'bg-amber-500 text-slate-950 border-amber-200 shadow-md ring-2 ring-amber-300'
                          : 'bg-slate-900 text-amber-300 border-slate-700 hover:border-amber-500/60'
                      }`}
                    >
                      <div className="text-base">🧴</div>
                      <div className="text-[11px] font-black mt-0.5">Tái chế</div>
                    </button>

                    {/* Inorganic */}
                    <button
                      type="button"
                      onClick={() => setSelectedCorrectCategory('inorganic')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        selectedCorrectCategory === 'inorganic'
                          ? 'bg-orange-600 text-white border-orange-300 shadow-md ring-2 ring-orange-400'
                          : 'bg-slate-900 text-orange-300 border-slate-700 hover:border-orange-500/60'
                      }`}
                    >
                      <div className="text-base">📦</div>
                      <div className="text-[11px] font-black mt-0.5">Vô cơ</div>
                    </button>
                  </div>
                </div>

                {/* Optional Note */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Ghi chú chi tiết (tùy chọn):
                  </label>
                  <input
                    type="text"
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    placeholder="Ví dụ: Đây là nắp chai nhựa trong suốt, không phải túi nilon..."
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    maxLength={150}
                  />
                </div>

                <div className="text-[10px] text-slate-400 leading-tight bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                  <Info className="w-3 h-3 text-cyan-400 inline mr-1" />
                  Báo cáo này được lưu lại để ban chuyên môn STEM xem xét đánh giá độc lập. Ý kiến người dùng không tự động sửa nhãn mô hình hay nâng điểm số.
                </div>

                {/* Form Buttons */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsReportOpen(false)}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Quay lại
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Đang gửi...' : 'Gửi báo cáo'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
