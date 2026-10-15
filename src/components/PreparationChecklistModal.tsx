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
} from 'lucide-react';
import { WasteClassificationResult, PreparationStep, PreparationStepStatus } from '../types';
import { playClickSound } from '../utils/audio';

interface PreparationChecklistModalProps {
  isOpen: boolean;
  item: WasteClassificationResult | null;
  steps: PreparationStep[];
  onUpdateStepStatus: (stepId: string, status: PreparationStepStatus) => void;
  onConfirmComplete: () => void;
  onCancel: () => void;
}

export const PreparationChecklistModal: React.FC<PreparationChecklistModalProps> = ({
  isOpen,
  item,
  steps,
  onUpdateStepStatus,
  onConfirmComplete,
  onCancel,
}) => {
  if (!isOpen || !item) return null;

  const allConfirmed =
    steps.length === 0 ||
    steps.every((s) => s.status === 'completed' || s.status === 'not_applicable');

  const pendingCount = steps.filter((s) => s.status === 'pending' || !s.status).length;
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const notApplicableCount = steps.filter((s) => s.status === 'not_applicable').length;

  const getCategoryDetails = () => {
    switch (item.category) {
      case 'organic':
        return {
          title: 'Rác Hữu Cơ',
          colorBadge: 'bg-emerald-950/80 border-emerald-500 text-emerald-300',
          binBadge: 'bg-emerald-600 text-white',
          binText: 'Thùng Xanh Lá (Ủ phân vi sinh)',
          pointsText: '+1 Điểm STEM',
          borderColor: 'border-emerald-500/80',
          gradientBg: 'from-emerald-950/90 via-slate-900 to-slate-950',
        };
      case 'recyclable':
        return {
          title: 'Rác Tái Chế',
          colorBadge: 'bg-amber-950/80 border-amber-500 text-amber-300',
          binBadge: 'bg-amber-500 text-slate-950',
          binText: 'Thùng Vàng / Trắng (Tái sinh nguyên liệu)',
          pointsText: '+2 Điểm STEM',
          borderColor: 'border-amber-500/80',
          gradientBg: 'from-amber-950/90 via-slate-900 to-slate-950',
        };
      case 'inorganic':
      default:
        return {
          title: 'Rác Vô Cơ',
          colorBadge: 'bg-orange-950/80 border-orange-500 text-orange-300',
          binBadge: 'bg-orange-600 text-white',
          binText: 'Thùng Cam / Xám (Rác còn lại khó phân hủy)',
          pointsText: '+3 Điểm STEM',
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

          {/* Safety Special Notice if hazardous (e.g., batteries, sharp fragments) */}
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
        </div>

        {/* Scrollable Checklist Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          <div className="text-xs text-slate-300 leading-relaxed font-medium">
            Học sinh vui lòng thực hiện 1–2 bước xử lý cụ thể dưới đây và đánh dấu xác nhận trước khi bỏ rác vào thùng:
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
                      onClick={() => {
                        playClickSound();
                        onUpdateStepStatus(step.id, 'pending');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        status === 'pending'
                          ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-300 shadow-sm'
                          : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Chưa thực hiện</span>
                    </button>

                    {/* Status: Đã thực hiện */}
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        onUpdateStepStatus(step.id, 'completed');
                      }}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        status === 'completed'
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 border-2 border-emerald-300 shadow-md shadow-emerald-500/30 scale-105'
                          : 'bg-slate-950/60 border border-slate-800 text-slate-300 hover:text-emerald-300 hover:border-emerald-500/50'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Đã thực hiện</span>
                    </button>

                    {/* Status: Không áp dụng */}
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        onUpdateStepStatus(step.id, 'not_applicable');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        status === 'not_applicable'
                          ? 'bg-slate-700 border-2 border-slate-400 text-slate-100 shadow-sm'
                          : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
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
              allConfirmed
                ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
                : 'bg-amber-950/60 border-amber-500/60 text-amber-200'
            }`}
          >
            {allConfirmed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-amber-400 flex-shrink-0" />
            )}
            <span>
              {allConfirmed
                ? 'Tuyệt vời! Bạn đã xác nhận đầy đủ các bước chuẩn bị. Hãy bấm nút bên dưới để hoàn tất quy trình và tích điểm.'
                : `Còn ${pendingCount} bước ở trạng thái "Chưa thực hiện". Bạn cần xác nhận Đã thực hiện hoặc Không áp dụng cho mọi bước để được mở khóa hoàn tất quy trình.`}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            id="btn-cancel-preparation"
            onClick={() => {
              playClickSound();
              onCancel();
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition-all cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-4 h-4 text-slate-400" />
            <span>Hủy / Quét lại</span>
          </button>

          <button
            type="button"
            id="btn-complete-preparation"
            disabled={!allConfirmed}
            onClick={() => {
              playClickSound();
              onConfirmComplete();
            }}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs sm:text-sm tracking-wide transition-all shadow-xl cursor-pointer ${
              allConfirmed
                ? 'bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 shadow-emerald-500/40 ring-4 ring-emerald-400/30 hover:scale-105 active:scale-95 animate-pulse hover:animate-none'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>HOÀN TẤT & BỎ VÀO THÙNG (+{item.points} Đ)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
