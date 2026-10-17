# Kế hoạch triển khai: Bắt buộc Quét Lại Camera Nghiệm Thu Chai Nhựa Đã Đổ Rỗng Nước

## 1. Mục tiêu và Nguyên lý Hoạt động
Học sinh khi phân loại rác tái chế (chai nhựa, lon nước, ly trà sữa) thường có thói quen vứt nguyên cả chai còn đầy nước hoặc đá ngọt vào thùng rác tái chế, làm ướt giấy bìa và ô nhiễm toàn bộ mẻ rác. 
Tính năng này sẽ:
1. **Phát hiện chất lỏng**: AI Vision nhận diện chai nhựa/ly nước còn nước/chất lỏng bên trong.
2. **Khóa điểm an toàn**: Tạm giữ `0 điểm` (chưa cộng vào tài khoản), gán nhãn trạng thái cần nghiệm thu (`requiresRescanEmpty = true`).
3. **Bắt buộc quét lại lần 2 qua camera**: Giao diện hướng dẫn học sinh đi trút hết nước, sau đó nhấn **"Mở camera quét lại nghiệm thu chai đã rỗng"**.
4. **AI xác minh chai rỗng**: AI quét lại hình ảnh chai đã đổ sạch nước / ép dẹp:
   - Nếu đã trút hết nước: Mở khóa cộng đủ **+2 Điểm Rác Tái Chế**, đồng bộ máy chủ và phát hiệu ứng chúc mừng.
   - Nếu vẫn còn nước: Tiếp tục giữ 0 điểm và yêu cầu trút cạn nước thật sạch.

---

## 2. Chi tiết các tệp cần cập nhật

### 2.1 Backend (`server.ts`)
- Mở rộng prompt Gemini Vision và JSON Schema:
  - `hasLiquid`: `boolean` (true nếu chai/ly/hộp còn chứa nước, đá, sữa hoặc chất lỏng).
  - `requiresRescanEmpty`: `boolean` (true nếu là vật thể tái chế nhưng còn chất lỏng, bắt buộc phải đổ nước và quét lại).
  - `liquidStateDescription`: `string` (mô tả tình trạng chất lỏng trong chai, ví dụ: "Chai nước suối còn khoảng 1/3 nước bên trong").
- Khi `hasLiquid === true` trên vật thể tái chế (`category === 'recyclable'`):
  - Ép `points = 0`.
  - Đặt `requiresRescanEmpty = true`.
  - Tạo chỉ dẫn bước bắt buộc: "Đổ hết nước thừa vào bồn rửa và đưa chai đã rỗng lên camera quét lại".
- Bổ sung logic kiểm tra nghiệm thu (Verification Mode) khi người dùng gửi ảnh quét lại:
  - AI kiểm tra xem chai đã được trút cạn nước / vặn nắp / ép dẹp chưa.
  - Khi nghiệm thu thành công: Trả về `rescanVerified = true`, khôi phục `points = 2` (Rác tái chế chuẩn).

### 2.2 Kiểu dữ liệu (`src/types.ts`)
- Bổ sung vào interface `WasteClassificationResult`:
  ```typescript
  hasLiquid?: boolean;
  requiresRescanEmpty?: boolean;
  liquidStateDescription?: string;
  isRescanVerification?: boolean;
  rescanVerified?: boolean;
  ```

### 2.3 Giao diện Bảng kiểm & Xác nhận (`src/components/PreparationChecklistModal.tsx`)
- Khi phát hiện `requiresRescanEmpty = true`:
  - Thay vì cho phép tự tích chọn rồi nhận điểm ngay, hiển thị badge cảnh báo nổi bật: **"CHAI CÒN NƯỚC - BẮT BUỘC QUÉT LẠI ĐỂ NHẬN ĐIỂM"**.
  - Ẩn nút nhận điểm trực tiếp; thay thế bằng nút nổi bật: **"📷 Đi trút nước & Quét lại camera ngay"**.
  - Hiển thị hướng dẫn trực quan: Trút hết nước thừa -> Ép dẹp vỏ chai -> Đưa trước camera.

### 2.4 Luồng Quét Camera (`src/components/WebcamScanner.tsx`)
- Thêm chế độ quét nghiệm thu (`isRescanMode`):
  - Hiển thị khung ngắm chuyên dụng màu vàng-xanh: *"Đang kiểm tra chai đã đổ hết nước..."*.
  - Khi người dùng chụp hoặc quét mẫu chai đã trút nước: Gửi cờ `isRescanVerification: true` và `previousScanId`.
  - Nhận diện phản hồi:
    - Nếu chai đã rỗng: Kích hoạt âm thanh chiến thắng, hiển thị thông báo popup chúc mừng *"Đã xác minh chai sạch rỗng! +2 Điểm tái chế"*, lưu lịch sử và đồng bộ điểm lên Supabase/máy chủ.
    - Nếu vẫn còn nước: Cảnh báo *"Phát hiện chai vẫn còn đọng nước. Hãy dốc cạn nước rồi thử lại!"*.

### 2.5 Lịch sử & Báo cáo (`src/components/ClassificationHistory.tsx` & `PointsNotification.tsx`)
- Đánh dấu các lượt quét đã qua bước xác minh chai rỗng với huy hiệu: *"Đã trút rỗng nước"* để tăng tính minh bạch trong hội đồng chấm thi STEM.

---

## 3. Các bước kiểm thử
1. Thử quét ảnh/vật thể chai nước còn nguyên nước -> Kiểm tra AI phát hiện `hasLiquid: true`, điểm số bằng 0 và modal yêu cầu quét lại xuất hiện.
2. Thử nghiệm nút "Quét lại camera" -> Camera mở ra với khung ngắm nghiệm thu.
3. Thử quét chai nước đã trút rỗng / ép dẹp -> AI nhận diện thành công chai rỗng -> Điểm số cộng 2 điểm tái chế chuẩn và đồng bộ lên bảng xếp hạng.
4. Chạy `lint_applet` và `compile_applet` để đảm bảo hệ thống không có lỗi build.
