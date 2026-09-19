import React from 'react';
import { X, BookOpen, Sprout, Recycle, ShieldAlert, CheckCircle2, Award, Lightbulb } from 'lucide-react';

interface WasteGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WasteGuideModal: React.FC<WasteGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-100 tracking-tight">
                CẨM NANG PHÂN LOẠI RÁC & TÍCH ĐIỂM
              </h2>
              <p className="text-xs text-slate-400">
                Hướng dẫn phân loại rác bảo vệ môi trường và quy định tích điểm
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 text-xs sm:text-sm leading-relaxed">
          {/* Why the 1, 2, 3 points mechanism? */}
          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-emerald-300 text-sm mb-1">
                Vì sao có cơ chế thưởng: Hữu cơ (+1đ) &bull; Tái chế (+2đ) &bull; Vô cơ (+3đ)?
              </h4>
              <p className="text-slate-300 text-xs leading-relaxed">
                Rác vô cơ (túi nilon, pin cũ, đồ điện tử) và rác tái chế có nguy cơ gây ô nhiễm đất, nước kéo dài hàng trăm năm. Hệ thống trao <strong>+3 điểm</strong> cho rác vô cơ và <strong>+2 điểm</strong> cho rác tái chế nhằm <strong>khuyến khích người dân chủ động nhặt gom, phân loại và ngăn chặn rác độc hại xâm nhập môi trường tự nhiên</strong>.
              </p>
            </div>
          </div>

          {/* 3 Categories Breakdown */}
          <div className="space-y-4">
            {/* 1. Rác Hữu Cơ */}
            <div className="p-4 rounded-2xl bg-slate-950 border-2 border-emerald-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <Sprout className="w-4 h-4" />
                  </span>
                  <span className="font-black text-emerald-400 text-base">1. RÁC HỮU CƠ</span>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500 text-slate-950 font-black text-xs font-mono">
                  +1 ĐIỂM
                </span>
              </div>
              <p className="text-xs text-slate-300">
                <strong>Đặc điểm:</strong> Các loại rác có nguồn gốc tự nhiên từ thực vật, động vật, dễ phân hủy sinh học trong thời gian ngắn (từ 2 đến 8 tuần).
              </p>
              <div className="text-xs text-slate-400">
                <strong>Ví dụ tiêu biểu:</strong> Vỏ chuối, vỏ dưa hấu, cuống rau, thức ăn thừa, bã trà, bã cà phê, lá cây khô, hoa héo.
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Quy trình chuẩn: Bỏ vào <strong>Thùng Xanh Lá</strong> để làm mùn giun quế hoặc ủ compost bón cây xanh trường học.</span>
              </div>
            </div>

            {/* 2. Rác Tái Chế */}
            <div className="p-4 rounded-2xl bg-slate-950 border-2 border-amber-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <Recycle className="w-4 h-4" />
                  </span>
                  <span className="font-black text-amber-400 text-base">2. RÁC TÁI CHẾ</span>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs font-mono">
                  +2 ĐIỂM
                </span>
              </div>
              <p className="text-xs text-slate-300">
                <strong>Đặc điểm:</strong> Các vật liệu nhân tạo sạch có thể tái chế thu hồi để tái sử dụng hoặc sản xuất thành sản phẩm mới trong nền kinh tế tuần hoàn.
              </p>
              <div className="text-xs text-slate-400">
                <strong>Ví dụ tiêu biểu:</strong> Chai nhựa PET (Lavie, Aquafina), vỏ lon nhôm (Coca, bia), vỏ hộp sữa giấy tiệt trùng, thùng bìa carton, chai lọ thủy tinh.
              </div>
              <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Quy trình chuẩn: Rửa sạch nước thừa, làm dẹp gọn gàng và bỏ vào <strong>Thùng Vàng / Trắng</strong> để chuyển nhà máy tái sinh.</span>
              </div>
            </div>

            {/* 3. Rác Vô Cơ */}
            <div className="p-4 rounded-2xl bg-slate-950 border-2 border-orange-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <span className="font-black text-orange-400 text-base">3. RÁC VÔ CƠ (VÀ NGUY HẠI)</span>
                </div>
                <span className="px-3 py-1 rounded-full bg-orange-500 text-white font-black text-xs font-mono">
                  +3 ĐIỂM
                </span>
              </div>
              <p className="text-xs text-slate-300">
                <strong>Đặc điểm:</strong> Các loại rác thải không thể tái chế thông thường hoặc mất từ 100 đến 500 năm mới phân hủy; rác chứa hóa chất độc hại gây nguy hiểm cho hệ sinh thái.
              </p>
              <div className="text-xs text-slate-400">
                <strong>Ví dụ tiêu biểu:</strong> Túi nilon dùng 1 lần, hộp xốp thực phẩm dính dầu mỡ, pin cũ, bóng đèn huỳnh quang, gốm sứ vỡ, khẩu trang y tế, bật lửa hỏng.
              </div>
              <div className="p-2.5 rounded-xl bg-orange-950/50 border border-orange-500/30 text-[11px] text-orange-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <span>Quy trình chuẩn: Bỏ vào <strong>Thùng Cam / Xám</strong> hoặc điểm thu gom pin chuyên dụng; tuyệt đối không đốt hay vứt bừa bãi.</span>
              </div>
            </div>
          </div>

          {/* Anti-Cheat & Duplicate Prevention Mechanism Section */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/40 via-slate-900 to-amber-950/30 border-2 border-rose-500/40 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/40">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm text-rose-300 uppercase tracking-tight">
                  Hệ Thống Chống Gian Lận Đa Tầng (Anti-Cheat & Duplicate Shield)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Giải quyết triệt để vấn đề: Dùng 1 bức ảnh quét đi quét lại, hoặc dùng 1 chai nhựa để cày điểm ảo
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="font-bold text-rose-400 flex items-center gap-1.5 text-xs">
                  <span>1. Checksum & Mã Băm Tệp</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Ngăn chặn tải lên hoặc quét lại <strong>cùng 1 tệp ảnh</strong>. Dù người dùng đổi tên file hay quét lại sau nhiều phút, chữ ký số byte trùng khớp 100% sẽ bị khóa ngay.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1.5 text-xs">
                  <span>2. Sổ Vân Tay Suốt Phiên</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Mỗi lần quét thành công, dHash 64-bit được ghi vào <em>Sổ Lưu Trữ</em>. Hệ thống đối chứng với <strong>toàn bộ lịch sử</strong>, ngăn chặn chiêu trò quét xen kẽ để né cooldown.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="font-bold text-cyan-400 flex items-center gap-1.5 text-xs">
                  <span>3. Chống Chụp Màn Hình</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  AI thị giác phân tích viền điện thoại, phản quang kính và moiré pattern để phát hiện học sinh giơ màn hình điện thoại khác có ảnh rác lên trước camera.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs">
                  <span>4. Khóa Bỏ Vào Thùng</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Sau mỗi lượt quét, hệ thống chuyển sang trạng thái <em>Chờ bỏ rác vào thùng</em> và chỉ mở khóa khi người dùng xác nhận đã bỏ món rác đó vào thùng.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
