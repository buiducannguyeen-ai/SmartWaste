import React from 'react';
import {
  CheckCircle2,
  Clock,
  MinusCircle,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Info,
  RefreshCw,
  Award,
  Camera,
} from 'lucide-react';
import { WasteClassificationResult, PreparationStep, PreparationStepStatus } from '../types';
import { playClickSound } from '../utils/audio';

interface PreparationChecklistModalProps {
  isOpen: boolean;
  item: WasteClassificationResult | null;
  steps: PreparationStep[];
  onUpdateStepStatus: (stepId: string, status: PreparationStepStatus) => void;
  onConfirmComplete: () => Promise<void> | void;
  onCancel: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  onRetry?: () => void;
  onStartRescan?: (item: WasteClassificationResult) => void;
}

export const PreparationChecklistModal: React.FC<PreparationChecklistModalProps> = ({
  isOpen,
  item,
  steps,
  onUpdateStepStatus,
  onConfirmComplete,
  onCancel,
  isSubmitting = false,
  errorMessage = null,
  successMessage = null,
  onRetry,
  onStartRescan,
}) => {
  if (!isOpen || !item) return null;

  const allConfirmed =
    steps.length === 0 ||
    steps.every((s) => s.status === 'completed' || s.status === 'not_applicable');

  const pendingCount = steps.filter((s) => s.status === 'pending' || !s.status).length;
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const notApplicableCount = steps.filter((s) => s.status === 'not_applicable').length;

  // Strict STEM Points calculation: Hữu cơ = 1, Tái chế = 2, Vô cơ = 3
  const isPendingRescan = Boolean(item.requiresRescanEmpty && !item.rescanVerified);
  const pointsToAward = isPendingRescan ? 0 : item.category === 'organic' ? 1 : item.category === 'recyclable' ? 2 : 3;

  const getCategoryDetails = () => {
    switch (item.category) {
      case 'organic':
        return {
          title: 'Rác Hữu Cơ',
          colorBadge: 'bg-emerald-950/80 border-emerald-500 text-emerald-300',
          binBadge: 'bg-emerald-600 text-white',
          binText: 'Thùng Xanh Lá (Ủ phân vi sinh)',
          pointsText: isPendingRescan ? '0 Điểm (Tạm khóa)' : `+${pointsToAward} Điểm STEM`,
          borderColor: 'border-emerald-500/80',
          gradientBg: 'from-emerald-950/90 via-slate-900 to-slate-950',
        };
      case 'recyclable':
        return {
          title: 'Rác Tái Chế',
          colorBadge: isPendingRescan
            ? 'bg-amber-950/80 border-amber-400 text-amber-200'
            : 'bg-amber-950/80 border-amber-500 text-amber-300',
          binBadge: 'bg-amber-500 text-slate-950',
          binText: 'Thùng Vàng / Trắng (Tái sinh nguyên liệu)',
          pointsText: isPendingRescan ? '0 Điểm (Chai còn nước)' : `+${pointsToAward} Điểm STEM`,
          borderColor: isPendingRescan ? 'border-amber-400/90' : 'border-amber-500/80',
          gradientBg: 'from-amber-950/90 via-slate-900 to-slate-950',
        };
      case 'inorganic':
      default:
        return {
          title: 'Rác Vô Cơ',
          colorBadge: 'bg-orange-950/80 border-orange-500 text-orange-300',
          binBadge: 'bg-orange-600 text-white',
          binText: 'Thùng Cam / Xám (Rác còn lại khó phân hủy)',
          pointsText: `+${pointsToAward} Điểm STEM`,
          borderColor: 'border-orange-500/80',
          gradientBg: 'from-orange-950/90 via-slate-900 to-slate-950',
        };
    }
  };

  const cat = getCategoryDetails();

  return (
    <div
      id="preparation-checklist-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className={`w-full max-w-lg bg-gradient-to-b ${cat.gradientBg} border-2 ${cat.borderColor} rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200`}
      >
        {/* Top 3-State Progress Pipeline */}
        <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 text-[11px] font-mono flex items-center justify-between gap-2">
          {/* State 1: AI đã nhận diện */}
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">1. AI ĐÃ NHẬN DIỆN</span>
          </div>

          <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />

          {/* State 2: Xác nhận hành động */}
          <div
            className={`flex items-center gap-1.5 font-bold truncate ${
              allConfirmed ? 'text-emerald-400' : 'text-amber-300 animate-pulse'
            }`}
          >
            {allConfirmed ? (
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            )}
            <span className="truncate">2. HỌC SINH XÁC NHẬN</span>
          </div>

          <ArrowRight className="w-3 h-3 text-slate-600 flex-shrink-0" />

          {/* State 3: Máy chủ ghi nhận điểm */}
          <div
            className={`flex items-center gap-1.5 font-bold truncate ${
              successMessage
                ? 'text-emerald-400'
                : isSubmitting
                ? 'text-cyan-300 animate-spin'
                : 'text-slate-500'
            }`}
          >
            {successMessage ? (
              <Award className="w-3.5 h-3.5 flex-shrink-0" />
            ) : isSubmitting ? (
              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full border border-slate-600 inline-block flex-shrink-0 text-center leading-3 text-[9px]">
                3
              </span>
            )}
            <span className="truncate">3. GHI NHẬN ĐIỂM</span>
          </div>
        </div>

        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>HƯỚNG DẪN XỬ LÝ TRƯỚC KHI BỎ RÁC</span>
            </div>
            <span className="text-xs font-mono font-bold text-slate-400">
              {completedCount + notApplicableCount}/{steps.length} bước đã xác nhận
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1">
            {item.rawImage && (
              <img
                src={item.rawImage}
                alt={item.itemName}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-slate-700 flex-shrink-0 shadow-md"
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-black text-white truncate tracking-tight">
                {item.itemName}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${cat.colorBadge}`}>
                  {cat.title}
                </span>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-mono border border-slate-700">
                  {cat.pointsText}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                    isPendingRescan
                      ? 'text-amber-300 bg-amber-950/80 border-amber-500/60 font-black animate-pulse'
                      : item.rescanVerified
                      ? 'text-emerald-300 bg-emerald-950/80 border-emerald-500/60 font-black'
                      : 'text-amber-300/90 bg-amber-950/60 border-amber-500/40'
                  }`}
                >
                  {isPendingRescan
                    ? 'Chai còn nước (Bắt buộc quét lại)'
                    : item.rescanVerified
                    ? 'Đã xác minh chai rỗng'
                    : 'Chưa cộng điểm (Chờ hoàn tất xử lý)'}
                </span>
              </div>
            </div>
          </div>

          {/* Target Bin Indicator */}
          <div className="mt-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${cat.binBadge}`}>
                THÙNG PHÙ HỢP
              </span>
              <span className="text-slate-200 font-semibold">{cat.binText}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </div>

          {/* Liquid Warning Notice if bottle contains water */}
          {isPendingRescan && (
            <div className="mt-2.5 p-3 rounded-2xl bg-gradient-to-r from-amber-950/95 via-orange-950/90 to-amber-900/90 border-2 border-amber-400 text-amber-200 flex items-start gap-3 text-xs shadow-lg shadow-amber-950/50">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1 min-w-0">
                <span className="font-black uppercase tracking-wide block text-amber-300">
                  CHAI CÒN NƯỚC &bull; TẠM KHÓA 0 ĐIỂM &bull; BẮT BUỘC QUÉT LẠI
                </span>
                <p className="mt-1 text-slate-200 leading-relaxed font-medium">
                  {item.liquidStateDescription || 'Hệ thống phát hiện chai/ly còn chứa nước bên trong.'} Để bảo vệ các loại rác tái chế khác không bị ẩm ướt, bạn hãy <strong>đổ hết nước vào bồn rửa</strong>, sau đó nhấn nút <strong>&ldquo;Quét lại camera nghiệm thu&rdquo;</strong> bên dưới để AI xác minh chai rỗng và mở khóa +2 điểm tái chế!
                </p>
              </div>
            </div>
          )}

          {/* Rescan Verified Banner */}
          {item.rescanVerified && (
            <div className="mt-2.5 p-3 rounded-2xl bg-gradient-to-r from-emerald-950/95 via-teal-950/90 to-emerald-900/90 border-2 border-emerald-400 text-emerald-200 flex items-start gap-3 text-xs shadow-lg shadow-emerald-950/50">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-black uppercase tracking-wide block text-emerald-300">
                  ĐÃ XÁC MINH CHAI RỖNG HOÀN TOÀN &bull; +2 ĐIỂM ĐÃ MỞ KHÓA
                </span>
                <p className="mt-1 text-slate-200 leading-relaxed font-medium">
                  {item.description || 'AI đã xác nhận chai nhựa sạch rỗng, không còn nước. Bạn có thể nhấn xác nhận để cộng điểm vào tài khoản.'}
                </p>
              </div>
            </div>
          )}

          {/* Safety Special Notice if hazardous */}
          {(item.isHazardousOrSpecial || item.specialHandlingNotice) && (
            <div className="mt-2.5 p-3 rounded-xl bg-rose-950/80 border-2 border-rose-500/70 text-rose-200 flex items-start gap-2.5 text-xs shadow-md shadow-rose-950/40">
              <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-black uppercase tracking-wide block text-rose-300">
                  ƯU TIÊN AN TOÀN & THU GOM NGUY HẠI RIÊNG
                </span>
                <p className="mt-0.5 text-[11px] text-rose-100/90 leading-relaxed">
                  {item.specialHandlingNotice ||
                    'Vật này chứa hóa chất hoặc nguy cơ thương tích. KHÔNG bỏ chung thùng rác sinh hoạt. Chuyển đến điểm thu gom nguy hại riêng của trường/khu phố.'}
                </p>
              </div>
            </div>
          )}

          {/* Local Regulation Notice if applicable */}
          {item.localRuleNote && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-blue-950/80 border border-blue-500/60 text-blue-200 flex items-start gap-2.5 text-xs shadow-sm">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-blue-300 block">
                  QUY ĐỊNH THU GOM ĐỊA PHƯƠNG
                </span>
                <p className="mt-0.5 text-[11px] text-blue-100/90 leading-relaxed">
                  {item.localRuleNote}
                </p>
              </div>
            </div>
          )}

          {/* AI Uncertainty Notice if applicable */}
          {item.isUncertain && item.uncertaintyReason && (
            <div className="mt-2.5 p-2.5 rounded-xl bg-amber-950/80 border border-amber-500/60 text-amber-200 flex items-start gap-2.5 text-xs shadow-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300 block">
                  AI CẦN THÊM THÔNG TIN ĐỂ CHÍNH XÁC HƠN
                </span>
                <p className="mt-0.5 text-[11px] text-amber-100/90 leading-relaxed">
                  {item.uncertaintyReason}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Checklist Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Celebratory Success Banner if server recording completed */}
          {successMessage && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-teal-950/90 to-emerald-900/90 border-2 border-emerald-400 text-center shadow-xl shadow-emerald-950/50 animate-in zoom-in-95 duration-200">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-400 mx-auto mb-2">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-emerald-200 uppercase tracking-tight">
                Xử Lý Và Phân Loại Rác Thành Công!
              </h3>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed font-semibold">
                {successMessage}
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 text-emerald-300 text-xs font-mono font-black border border-emerald-400/40">
                <span>+{pointsToAward} ĐIỂM ĐÃ ĐƯỢC GHI NHẬN</span>
              </div>
            </div>
          )}

          {/* Error Notice Banner if point recording failed */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-950/90 border-2 border-rose-500 text-rose-200 space-y-2.5 animate-in fade-in duration-200 shadow-xl shadow-rose-950/40">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black uppercase text-rose-200 tracking-wide">
                    Lưu Điểm Thất Bại &bull; Chưa Cộng Điểm
                  </h4>
                  <p className="text-xs text-rose-100/90 mt-0.5 leading-relaxed">
                    {errorMessage}. Để đảm bảo an toàn và chống phát sinh điểm giả, số điểm chưa được ghi nhận vào tài khoản. Bạn có thể bấm &ldquo;Thử lại&rdquo; để gửi lại yêu cầu an toàn.
                  </p>
                </div>
              </div>
              {onRetry && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      onRetry();
                    }}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                    <span>{isSubmitting ? 'Đang thử lại...' : 'Thử lại lưu điểm'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-slate-300 leading-relaxed font-medium">
            Học sinh xác nhận đã thực hiện các bước xử lý cụ thể dưới đây trước khi bỏ vào thùng rác:
          </div>

          <div className="space-y-3">
            {steps.map((step, idx) => {
              const status = step.status || 'pending';
              const isWarning = Boolean(step.isSafetyWarning);

              return (
                <div
                  key={step.id || `step-${idx}`}
                  className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all ${
                    status === 'completed'
                      ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-950/30'
                      : status === 'not_applicable'
                      ? 'bg-slate-900/90 border-slate-700/80 opacity-80'
                      : isWarning
                      ? 'bg-rose-950/30 border-rose-500/60'
                      : 'bg-slate-900/90 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {/* Step Title & Instruction */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${
                        status === 'completed'
                          ? 'bg-emerald-400 text-slate-950'
                          : status === 'not_applicable'
                          ? 'bg-slate-700 text-slate-300'
                          : isWarning
                          ? 'bg-rose-500 text-white'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
                      }`}
                    >
                      {status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : status === 'not_applicable' ? (
                        <MinusCircle className="w-4 h-4" />
                      ) : (
                        idx + 1
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                          Bước {idx + 1}
                        </span>
                        {isWarning && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/50 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span>Cảnh báo an toàn</span>
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-black text-slate-100 mt-0.5 leading-snug">
                        {step.instruction}
                      </h4>

                      {step.reason && (
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          <strong className="text-slate-300 font-semibold">Lý do: </strong>
                          {step.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 3 Interactive Status Buttons */}
                  <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-end gap-2">
                    {/* Status: Chưa thực hiện */}
                    <button
                      type="button"
                      disabled={isSubmitting || Boolean(successMessage)}
                      onClick={() => {
                        playClickSound();
                        onUpdateStepStatus(step.id, 'pending');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        status === 'pending'
                          ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-300 shadow-sm'
                          : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Chưa thực hiện</span>
                    </button>

                    {/* Status: Đã thực hiện */}
                    <button
                      type="button"
                      disabled={isSubmitting || Boolean(successMessage)}
                      onClick={() => {
                        playClickSound();
                        onUpdateStepStatus(step.id, 'completed');
                      }}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        status === 'completed'
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 border-2 border-emerald-300 shadow-md shadow-emerald-500/30 scale-105'
                          : 'bg-slate-950/60 border border-slate-800 text-slate-300 hover:text-emerald-300 hover:border-emerald-500/50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Đã thực hiện</span>
                    </button>

                    {/* Status: Không áp dụng */}
                    <button
                      type="button"
                      disabled={isSubmitting || Boolean(successMessage)}
                      onClick={() => {
                        playClickSound();
                        onUpdateStepStatus(step.id, 'not_applicable');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        status === 'not_applicable'
                          ? 'bg-slate-700 border-2 border-slate-400 text-slate-100 shadow-sm'
                          : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title="Chọn nếu vật thể đã sạch/rỗng sẵn hoặc không cần thiết áp dụng bước này"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>Không áp dụng</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress / Completion Notice */}
          <div
            className={`p-3 rounded-2xl border text-xs leading-relaxed flex items-center gap-2.5 ${
              isPendingRescan
                ? 'bg-amber-950/70 border-amber-500/70 text-amber-200'
                : allConfirmed
                ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
                : 'bg-amber-950/60 border-amber-500/60 text-amber-200'
            }`}
          >
            {isPendingRescan ? (
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 animate-bounce" />
            ) : allConfirmed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-amber-400 flex-shrink-0" />
            )}
            <span>
              {isPendingRescan
                ? '⚠️ CHAI CÒN CHẤT LỎNG: Hệ thống đang tạm khóa 0 điểm. Hãy trút sạch nước thừa vào bồn rửa, sau đó bấm nút màu cam bên dưới để camera quét lại nghiệm thu chai rỗng (mở khóa +2 điểm).'
                : allConfirmed
                ? 'Tuyệt vời! Bạn đã xác nhận đầy đủ các bước. Hãy nhấn nút "Tôi đã xử lý và bỏ rác đúng cách" bên dưới để hệ thống ghi nhận điểm.'
                : `Còn ${pendingCount} bước ở trạng thái "Chưa thực hiện". Bạn cần xác nhận "Đã thực hiện" hoặc "Không áp dụng" cho mọi bước để mở khóa nút xác nhận.`}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            id="btn-cancel-preparation"
            disabled={isSubmitting}
            onClick={() => {
              playClickSound();
              onCancel();
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4 text-slate-400" />
            <span>Hủy / Quét lại (+0 đ)</span>
          </button>

          {/* Core confirmation or Rescan button */}
          {isPendingRescan ? (
            <button
              type="button"
              id="btn-start-rescan-empty"
              onClick={() => {
                playClickSound();
                if (onStartRescan) onStartRescan(item);
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs sm:text-sm tracking-wide bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 hover:from-amber-300 hover:to-orange-300 text-slate-950 shadow-xl shadow-amber-500/40 ring-4 ring-amber-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer animate-pulse hover:animate-none"
            >
              <Camera className="w-5 h-5 text-slate-950" />
              <span>Đã trút hết nước &bull; Quét lại camera nghiệm thu (+2 Đ)</span>
            </button>
          ) : (
            <button
              type="button"
              id="btn-confirm-processed-waste"
              disabled={!allConfirmed || isSubmitting || Boolean(successMessage)}
              onClick={() => {
                playClickSound();
                onConfirmComplete();
              }}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs sm:text-sm tracking-wide transition-all shadow-xl cursor-pointer ${
                successMessage
                  ? 'bg-emerald-500 text-slate-950 cursor-default'
                  : isSubmitting
                  ? 'bg-cyan-600 text-white cursor-wait opacity-80'
                  : allConfirmed
                  ? 'bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 shadow-emerald-500/40 ring-4 ring-emerald-400/30 hover:scale-105 active:scale-95 animate-pulse hover:animate-none'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  <span>Đang ghi nhận điểm...</span>
                </>
              ) : successMessage ? (
                <>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Đã ghi nhận điểm (+{pointsToAward} Đ)</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Tôi đã xử lý và bỏ rác đúng cách (+{pointsToAward} Đ)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
