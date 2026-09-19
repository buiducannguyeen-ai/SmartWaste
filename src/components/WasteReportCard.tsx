import React, { useState } from 'react';
import {
  MapPin,
  Calendar,
  ShieldCheck,
  ThumbsUp,
  Clock,
  AlertCircle,
  CheckCircle,
  Sparkles,
  Maximize2,
  Check,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { WasteReport, ReportProcessingStatus } from '../types';
import { playClickSound, playPointSound } from '../utils/audio';

interface WasteReportCardProps {
  report: WasteReport;
  onUpvote: (id: string) => void;
  onUpdateStatus?: (id: string, status: ReportProcessingStatus, note?: string) => void;
  onDelete?: (id: string) => void;
  onViewImage: (imageUrl: string, caption: string) => void;
}

export const WasteReportCard: React.FC<WasteReportCardProps> = ({
  report,
  onUpvote,
  onUpdateStatus,
  onDelete,
  onViewImage,
}) => {
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleUpvote = () => {
    if (hasUpvoted) return;
    setHasUpvoted(true);
    playPointSound(1);
    onUpvote(report.id);
  };

  const handleStatusChange = (newStatus: ReportProcessingStatus) => {
    setShowStatusMenu(false);
    playClickSound();
    let note: string | undefined;
    if (newStatus === 'resolved') {
      note = 'Đội vệ sinh môi trường đã hoàn thành thu gom rác thải và làm sạch khu vực.';
    } else if (newStatus === 'investigating') {
      note = 'Đơn vị quản lý đô thị đã tiếp nhận và đang điều phối xe chuyên dụng tới xử lý.';
    }
    onUpdateStatus?.(report.id, newStatus, note);
  };

  // Format time ago or date
  const formatTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    return new Date(timestamp).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusConfig = {
    reported: {
      label: 'Mới phản ánh',
      bg: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
      icon: Clock,
    },
    investigating: {
      label: 'Đang tiếp nhận xử lý',
      bg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
      icon: AlertCircle,
    },
    resolved: {
      label: 'Đã dọn dẹp sạch',
      bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
      icon: CheckCircle,
    },
  }[report.status] || {
    label: 'Chờ xử lý',
    bg: 'bg-slate-800 text-slate-300 border-slate-700',
    icon: Clock,
  };

  const severityConfig = {
    urgent: { label: 'Khẩn cấp', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
    high: { label: 'Nghiêm trọng', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
    medium: { label: 'Mức trung bình', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    low: { label: 'Mức nhẹ', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  }[report.severityLevel] || { label: 'Mức trung bình', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };

  const StatusIcon = statusConfig.icon;

  return (
    <div
      id={`waste-report-${report.id}`}
      className="flex flex-col bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-emerald-950/20 transition-all group"
    >
      {/* Image Container with Badges */}
      <div className="relative aspect-[16/10] w-full bg-slate-950 overflow-hidden cursor-pointer" onClick={() => onViewImage(report.imageUrl, report.location)}>
        {imgError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/90 text-slate-400 p-4 text-center">
            <AlertCircle className="w-8 h-8 text-amber-400/80 mb-2" />
            <span className="text-xs font-semibold text-slate-300">Không thể tải ảnh thực tế</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Hình ảnh lỗi hoặc bị chặn mạng</span>
          </div>
        ) : (
          <img
            src={report.imageUrl}
            alt={report.location}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none" />

        {/* Top Floating Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-auto">
          {/* AI Verified Badge with Optical Authenticity Confirmation */}
          <div
            title={`Kiểm duyệt bởi: ${report.moderationDetails?.moderatedBy || 'Gemini AI'} - Đã xác thực ảnh quang học thực tế (Chống ảnh AI giả mạo)`}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-950/90 text-emerald-300 border border-emerald-400/60 backdrop-blur-md shadow-lg shadow-emerald-950/50"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Đã Duyệt AI</span>
            <span className="hidden sm:inline text-[10px] text-emerald-400/90 font-medium border-l border-emerald-500/40 pl-1.5">
              Ảnh thực tế
            </span>
          </div>

          {/* Severity Tag */}
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold border backdrop-blur-md shadow-md ${severityConfig.color}`}>
            {severityConfig.label}
          </div>
        </div>

        {/* Expand button hint */}
        <div className="absolute bottom-3 right-3 p-1.5 rounded-xl bg-slate-950/80 text-slate-300 backdrop-blur-sm border border-slate-700/60 opacity-0 group-hover:opacity-100 transition-opacity">
          <Maximize2 className="w-3.5 h-3.5" />
        </div>

        {/* Waste Type pill over bottom image */}
        {report.wasteTypeDetected && (
          <div className="absolute bottom-3 left-3 max-w-[80%]">
            <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-slate-950/85 text-emerald-300 border border-slate-700/80 backdrop-blur-md truncate">
              {report.wasteTypeDetected}
            </span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          {/* Location Line */}
          <div className="flex items-start gap-2 text-slate-200">
            <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <h3 className="font-extrabold text-sm sm:text-base text-slate-100 leading-snug line-clamp-2">
              {report.location}
            </h3>
          </div>

          {/* Description Text */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-3">
            {report.description}
          </p>

          {/* Resolution Note (if investigated or resolved) */}
          {report.resolutionNote && (
            <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-200/90 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-emerald-300 text-[11px] uppercase tracking-wider">
                <Check className="w-3.5 h-3.5" />
                Tiến độ xử lý:
              </div>
              <p className="text-[12px] text-slate-300 leading-normal">{report.resolutionNote}</p>
            </div>
          )}
        </div>

        {/* Card Footer: Author + Status + Upvote */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Author Details */}
          <div className="flex items-center gap-2">
            <span className="text-base select-none">{report.authorAvatar || '🌱'}</span>
            <div>
              <div className="font-bold text-slate-200 leading-tight line-clamp-1">{report.authorName}</div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <span>{formatTime(report.createdAt)}</span>
                {report.authorOrg && <span>&bull; {report.authorOrg}</span>}
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2">
            {/* Status Dropdown / Badge */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                title="Thay đổi tiến độ xử lý"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold border transition-all text-[11px] shadow-sm ${statusConfig.bg}`}
              >
                <StatusIcon className="w-3 h-3" />
                <span>{statusConfig.label}</span>
                {onUpdateStatus && <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />}
              </button>

              {/* Status change popup */}
              {showStatusMenu && onUpdateStatus && (
                <div className="absolute bottom-full right-0 mb-2 w-44 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-1.5 z-20 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                    Cập nhật tiến độ:
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('reported')}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-800 text-[11px] font-semibold text-amber-300 flex items-center gap-2"
                  >
                    <Clock className="w-3.5 h-3.5" /> Mới phản ánh
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('investigating')}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-800 text-[11px] font-semibold text-cyan-300 flex items-center gap-2"
                  >
                    <AlertCircle className="w-3.5 h-3.5" /> Đang xử lý
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange('resolved')}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-800 text-[11px] font-semibold text-emerald-300 flex items-center gap-2"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Đã dọn sạch
                  </button>
                </div>
              )}
            </div>

            {/* Delete button (if handler provided) */}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Bạn có chắc chắn muốn xóa bài phản ánh này khỏi cộng đồng?')) {
                    onDelete(report.id);
                  }
                }}
                className="p-2 rounded-full hover:bg-rose-950/70 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 transition-all active:scale-95"
                title="Xóa bài phản ánh"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Upvote Button */}
            <button
              type="button"
              onClick={handleUpvote}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs border transition-all active:scale-90 ${
                hasUpvoted
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border-slate-700'
              }`}
              title="Đồng tình phản ánh / Chung tay quan tâm"
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${hasUpvoted ? 'text-emerald-400 fill-emerald-400' : ''}`} />
              <span>{report.upvotes || 0}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
