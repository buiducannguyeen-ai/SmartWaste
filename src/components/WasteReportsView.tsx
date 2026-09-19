import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Camera,
  Search,
  Filter,
  RefreshCw,
  ShieldCheck,
  MapPin,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
  Layers,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { UserProfile, WasteReport, ReportProcessingStatus } from '../types';
import { WasteReportCard } from './WasteReportCard';
import { CreateReportModal } from './CreateReportModal';
import { fetchWasteReports, upvoteReport, updateReportStatus, deleteReportApi, clearAllReportsApi } from '../lib/wasteReportApi';
import { playClickSound } from '../utils/audio';

interface WasteReportsViewProps {
  currentUser: UserProfile | null;
  onOpenLogin: () => void;
}

export const WasteReportsView: React.FC<WasteReportsViewProps> = ({
  currentUser,
  onOpenLogin,
}) => {
  const [reports, setReports] = useState<WasteReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [previewImage, setPreviewImage] = useState<{ url: string; caption: string } | null>(null);

  // Load verified public reports
  const loadReports = async () => {
    setIsLoading(true);
    try {
      const data = await fetchWasteReports(statusFilter);
      setReports(data);
    } catch (err) {
      console.warn('Notice loading reports:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter]);

  // Handle report created
  const handleReportCreated = (newReport: WasteReport) => {
    setReports((prev) => [newReport, ...prev]);
  };

  // Handle upvote (server-confirmed, anti-duplicate)
  const handleUpvote = async (id: string) => {
    if (!currentUser) {
      onOpenLogin();
      return;
    }
    const res = await upvoteReport(id, currentUser.id);
    if (res.success && res.report) {
      setReports((prev) => prev.map((r) => (r.id === id ? res.report! : r)));
      playClickSound();
    } else {
      alert(res.error || 'Không thể gửi lượt đồng tình.');
    }
  };

  // Handle status update (server-confirmed)
  const handleUpdateStatus = async (
    id: string,
    newStatus: ReportProcessingStatus,
    note?: string
  ) => {
    const res = await updateReportStatus(id, newStatus, note, currentUser?.id);
    if (res.success && res.report) {
      setReports((prev) => prev.map((r) => (r.id === id ? res.report! : r)));
      playClickSound();
    } else {
      alert(res.error || 'Không thể cập nhật trạng thái. Vui lòng kiểm tra quyền truy cập.');
    }
  };

  // Handle delete report (server-confirmed)
  const handleDeleteReport = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bài phản ánh này không?')) return;
    const res = await deleteReportApi(id, currentUser?.id);
    if (res.success) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      playClickSound();
    } else {
      alert(res.error || 'Không thể xóa bài phản ánh. Bạn chỉ có thể xóa bài do chính mình đăng hoặc cần quyền Quản trị viên.');
    }
  };

  // Handle clear all reports to reset to clean real data (admin verified)
  const handleClearAll = async () => {
    const adminKey = window.prompt('Nhập mã khóa Quản trị viên (Admin Secret Key) để xác nhận xóa toàn bộ bài phản ánh:');
    if (!adminKey) return;
    const res = await clearAllReportsApi(adminKey);
    if (res.success) {
      setReports([]);
      playClickSound();
      alert('Đã xóa toàn bộ bài phản ánh thành công.');
    } else {
      alert(res.error || 'Mã Quản trị viên không chính xác hoặc máy chủ từ chối thao tác.');
    }
  };

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // Must be approved
      if (r.moderationStatus !== 'approved') return false;

      // Status filter
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesLocation = r.location.toLowerCase().includes(q);
        const matchesDesc = r.description.toLowerCase().includes(q);
        const matchesWaste = (r.wasteTypeDetected || '').toLowerCase().includes(q);
        return matchesLocation || matchesDesc || matchesWaste;
      }

      return true;
    });
  }, [reports, statusFilter, searchQuery]);

  // Quick statistics
  const stats = useMemo(() => {
    const total = reports.length;
    const reported = reports.filter((r) => r.status === 'reported').length;
    const investigating = reports.filter((r) => r.status === 'investigating').length;
    const resolved = reports.filter((r) => r.status === 'resolved').length;
    return { total, reported, investigating, resolved };
  }, [reports]);

  return (
    <div className="space-y-6">
      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-teal-950/50 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-xs font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>HỆ THỐNG KIỂM DUYỆT TỰ ĐỘNG BẰNG AI</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight leading-tight">
              Phản Ánh Tình Trạng Rác Thải Khu Dân Cư
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Cổng thông tin tiếp nhận phản ánh điểm nóng rác thải, xà bần và ô nhiễm môi trường từ người dân. Toàn bộ hình ảnh và mô tả đều được <strong className="text-emerald-300">AI kiểm duyệt nghiêm ngặt</strong> trước khi xuất bản công khai.
            </p>
          </div>

          {/* Primary Action Button: Create Report */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              id="btn-open-create-report"
              onClick={() => {
                playClickSound();
                setIsCreateModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-95 transition-all border border-emerald-300/40 group"
            >
              <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Gửi Bài Phản Ánh Mới</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Tổng số phản ánh đã duyệt</div>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{stats.total}</div>
          </div>
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <div className="text-xs text-amber-400 font-medium">Mới phản ánh</div>
            <div className="text-2xl font-black text-amber-400 font-mono mt-1">{stats.reported}</div>
          </div>
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <div className="text-xs text-cyan-400 font-medium">Đang xử lý / Dọn dẹp</div>
            <div className="text-2xl font-black text-cyan-400 font-mono mt-1">{stats.investigating}</div>
          </div>
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <div className="text-xs text-emerald-300 font-medium">Đã giải quyết sạch sẽ</div>
            <div className="text-2xl font-black text-emerald-300 font-mono mt-1">{stats.resolved}</div>
          </div>
        </div>
      </div>

      {/* AI Moderation Information Banner */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-slate-100">Tiêu chuẩn kiểm duyệt 100% tự động:</span>
            <span className="text-slate-400 ml-1.5 hidden sm:inline">
              AI chỉ chấp nhận ảnh liên quan đến rác thải thực tế & loại bỏ ngay các từ ngữ không phù hợp, xúc phạm.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-center">
          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-500/30">
            ✓ Chỉ bài đạt chuẩn mới được công khai
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo địa điểm, khu vực hoặc loại rác..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-400 text-xs sm:text-sm text-slate-200 outline-none transition-all placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'reported', label: 'Mới phản ánh' },
            { id: 'investigating', label: 'Đang xử lý' },
            { id: 'resolved', label: 'Đã dọn sạch' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                playClickSound();
                setStatusFilter(tab.id);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                statusFilter === tab.id
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-sm'
                  : 'bg-slate-950/80 hover:bg-slate-800 text-slate-400 border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Refresh button */}
          <button
            onClick={() => {
              playClickSound();
              loadReports();
            }}
            title="Làm mới danh sách"
            className="p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* Clear all reports button if any exist */}
          {reports.length > 0 && (
            <button
              onClick={handleClearAll}
              title="Xóa toàn bộ danh sách để nhập dữ liệu thực tế mới"
              className="px-2.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Làm sạch danh sách</span>
            </button>
          )}
        </div>
      </div>

      {/* Reports Grid */}
      {filteredReports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReports.map((report) => (
            <WasteReportCard
              key={report.id}
              report={report}
              onUpvote={handleUpvote}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDeleteReport}
              onViewImage={(url, caption) => setPreviewImage({ url, caption })}
            />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <MapPin className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-slate-200 text-base">Chưa có bài phản ánh nào trong mục này</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Bạn có thể gửi bài phản ánh đầu tiên về tình trạng rác thải tại khu vực mình sinh sống để chung tay bảo vệ môi trường!
            </p>
          </div>
          <button
            onClick={() => {
              playClickSound();
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-md active:scale-95"
          >
            <Camera className="w-4 h-4" />
            <span>Tạo bài phản ánh ngay</span>
          </button>
        </div>
      )}

      {/* Modal: Create Report */}
      <CreateReportModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        currentUser={currentUser}
        onReportCreated={handleReportCreated}
      />

      {/* Lightbox Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[16/10] sm:aspect-video w-full bg-black">
              <img
                src={previewImage.url}
                alt={previewImage.caption}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-between gap-4 border-t border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-200 font-bold truncate">
                <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">{previewImage.caption}</span>
              </div>
              <button
                onClick={() => setPreviewImage(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
