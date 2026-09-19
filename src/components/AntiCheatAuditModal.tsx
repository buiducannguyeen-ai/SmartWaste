import React from 'react';
import { ShieldCheck, ShieldAlert, X, Trash2, RotateCcw, Clock, Hash, CheckCircle, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { ScannedFingerprintRecord } from '../types';

interface AntiCheatAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  registry: ScannedFingerprintRecord[];
  onClearRegistry: () => void;
  onTestRescanItem: (record: ScannedFingerprintRecord) => void;
}

export const AntiCheatAuditModal: React.FC<AntiCheatAuditModalProps> = ({
  isOpen,
  onClose,
  registry,
  onClearRegistry,
  onTestRescanItem,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="anti-cheat-audit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">
                  SỔ KIỂM TOÁN VÂN TAY RÁC (ANTI-CHEAT)
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-bold">
                  {registry.length} MẪU ĐÃ LƯU
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Mỗi vật thể hoặc tệp ảnh chỉ được tích điểm 1 lần duy nhất trong toàn hệ thống.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Explain Rule Callout */}
        <div className="p-4 bg-emerald-950/40 border-b border-emerald-500/30 text-xs text-emerald-200 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Cơ chế bảo vệ chống gian lận đa tầng:</strong> Khi người dùng chụp camera, tải ảnh hoặc chọn mẫu, hệ thống tính toán <em>Mã băm sai phân quang học dHash 64-bit + Checksum tệp ảnh</em>. Bất kỳ ai sử dụng lại ảnh cũ hoặc cùng một chai nhựa/vật thể sẽ bị hệ thống phát hiện & từ chối cộng điểm ngay lập tức (+0 điểm).
          </div>
        </div>

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
          {registry.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <ShieldAlert className="w-12 h-12 mx-auto text-slate-600 opacity-50" />
              <p className="text-sm font-medium">Chưa có vật thể nào trong sổ kiểm toán.</p>
              <p className="text-xs text-slate-600">
                Hãy thực hiện quét rác bằng camera hoặc chọn mẫu demo để hệ thống tự động ghi nhận vân tay!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {registry.map((record) => {
                const dateStr = new Date(record.timestamp).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });
                return (
                  <div
                    key={record.id}
                    className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all flex items-start gap-3 shadow-md"
                  >
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                      {record.thumbnail ? (
                        <img
                          src={record.thumbnail}
                          alt={record.itemName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-600" />
                      )}
                      <span className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-[9px] text-center text-slate-400 font-mono">
                        {record.checksum || 'HASH'}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          {record.itemName}
                        </span>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                          +{record.points}đ
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr}</span>
                        <span>&bull;</span>
                        <span className="text-emerald-400">ĐÃ KHÓA</span>
                      </div>

                      <div className="text-[9px] font-mono text-slate-500 truncate" title={record.dHash}>
                        dHash: {record.dHash ? record.dHash.substring(0, 16) + '...' : 'N/A'}
                      </div>

                      {/* Test Rescan Button to show judges/teachers */}
                      <button
                        onClick={() => onTestRescanItem(record)}
                        className="mt-1 w-full text-[10px] font-bold py-1 px-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 transition-colors flex items-center justify-center gap-1"
                        title="Thử quét lại món này để xem cảnh báo chống gian lận"
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>Thử Quét Lại (Test Bị Chặn)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
          <button
            onClick={onClearRegistry}
            disabled={registry.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa Sổ Vân Tay (Bắt Đầu Lại)</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-colors"
          >
            Đóng Kiểm Toán
          </button>
        </div>
      </div>
    </div>
  );
};
