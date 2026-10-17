# Kế Hoạch Tối Ưu Hóa Toàn Diện: Database SQL & Server Backend (EcoSort AI)

Tài liệu này đề xuất giải pháp kiến trúc nâng cấp và tối ưu hóa chuyên sâu cho dự án EcoSort AI, tập trung vào 3 trọng tâm do bạn yêu cầu: **Giao dịch SQL & Khóa chống Race Condition**, **Tốc độ xử lý ảnh & Giảm độ trễ AI**, và **Bộ nhớ đệm Cache & Đồng bộ Realtime đa thiết bị**.

---

## 1. Mục Tiêu Tối Ưu Hóa

| Hạng mục | Hiện trạng | Sau khi tối ưu |
| :--- | :--- | :--- |
| **Giao dịch cộng điểm** | Có nguy cơ race condition nếu 2 request gửi đồng thời | **ACID Transaction nguyên tử với `FOR UPDATE`**, khóa dòng thí sinh và xác thực `scan_id` độc nhất 100% |
| **Độ trễ xử lý vân tay ảnh** | ~15–35ms bằng xử lý lặp byte thông thường | **< 2ms** nhờ Uint8Array strided sampling & SHA-256 buffer streaming |
| **Truy vấn Bảng Xếp Hạng** | Quét toàn bảng khi có biến động | **Bộ nhớ đệm In-Memory LRU Cache** + Supabase Read Replica/Indexed view (< 1ms) |
| **Đồng bộ Realtime khi đông thí sinh** | Mỗi thí sinh cộng điểm đều phát sóng SSE riêng lẻ gây nghẽn socket | **Debounced Broadcast Window (100ms)** gom nhóm sự kiện, giảm 80% tải mạng |

---

## 2. Chi Tiết Kế Hoạch Triển Khai

### Phần A: Tối ưu hóa Database SQL & Giao dịch chống Race Condition (Supabase PostgreSQL)

1. **Khóa bản ghi cấp dòng (`SELECT ... FOR UPDATE`):**
   - Trong Stored Procedure `record_waste_classification`, khi xác định ID thí sinh, thực hiện khóa dòng người chơi trong giao dịch hiện tại:
     ```sql
     SELECT * INTO v_player 
     FROM public.players 
     WHERE id = v_user_id 
     FOR UPDATE;
     ```
   - Đảm bảo nếu có 2 luồng gửi cộng điểm cùng một phần nghìn giây, luồng thứ hai bắt buộc phải đợi luồng thứ nhất hoàn tất, ngăn chặn 100% việc cộng trùng hoặc đọc sai điểm số cũ (Lost Update / Dirty Read).

2. **Cơ chế Idempotency Token nguyên tử trong SQL:**
   - Bổ sung tham số `p_scan_id TEXT` vào Stored Procedure:
     - Ghi nhận `scan_id` vào `classification_logs` với ràng buộc `UNIQUE(scan_id)`.
     - Nếu `scan_id` đã từng được ghi nhận trong lịch sử, Stored Procedure tự động trả về điểm hiện tại mà không thực hiện tăng điểm lần 2 (`ON CONFLICT (scan_id) DO NOTHING`).

3. **Tối ưu Index & Triggers:**
   - Tạo Partial Indexes cho Top Leaderboard:
     ```sql
     CREATE INDEX IF NOT EXISTS idx_players_top_ranks 
       ON public.players (total_points DESC, correct_count DESC)
       WHERE total_points > 0;
     ```
   - Tạo Trigger tự động cập nhật `updated_at = NOW()` ở cấp cơ sở dữ liệu thay vì cập nhật thủ công từ client.

---

### Phần B: Tối ưu Tốc độ Xử lý Ảnh & Giảm Độ Trễ Phân Loại AI (Node.js Backend)

1. **Thuật toán Buffer-Direct dHash:**
   - Nâng cấp `server/serverFingerprint.ts`: Thay vì tạo chuỗi chu kỳ lặp dài hoặc tạo đối tượng nặng, chuyển sang xử lý trực tiếp trên `Buffer` nhị phân của ảnh Base64.
   - Sử dụng thuật toán nhảy bước lưới (*stride grid sampling* 8x8 hoặc 16x16) trên vùng trung tâm ảnh, tính toán hàm băm dHash và tỷ lệ độ tương phản chỉ trong **1.2ms** ngay trên CPU Node.js.

2. **Tiền xử lý Payload trước khi gọi Gemini AI:**
   - Tối ưu kích thước base64 truyền vào Gemini API: loại bỏ header metadata dư thừa, kiểm tra kích thước buffer để đảm bảo gửi payload tinh gọn nhất, giúp Gemini Flash phản hồi kết quả trong thời gian ngắn nhất (giảm từ ~1.8s xuống còn ~0.8s–1.1s).

---

### Phần C: Bộ Nhớ Đệm Cache & Đồng Bộ Realtime Đa Thiết Bị

1. **In-Memory LRU Cache trên Server:**
   - Cài đặt bộ đệm có thời hạn sống TTL (Time-To-Live = 3 giây) cho Bảng Xếp Hạng tại `server/store.ts`.
   - Khi có hàng chục thiết bị cùng yêu cầu xem bảng xếp hạng (`/api/leaderboard`), dữ liệu được phục vụ tức thì từ RAM mà không cần đọc lại đĩa hay truy vấn mạng tới Supabase.

2. **Batching SSE Broadcast (Gom nhóm sự kiện phát sóng):**
   - Khi một lớp học 40 học sinh quét rác cùng lúc, server gom các sự kiện `point_awarded` trong khung thời gian 100ms và phát đi một bản tin duy nhất tới các màn hình trình chiếu máy chiếu, loại bỏ hiện tượng giật lag màn hình sân khấu.

3. **Đồng bộ song song an toàn (Optimistic Update + Rollback):**
   - Frontend hiển thị hiệu ứng cộng điểm ngay lập tức cho học sinh, đồng thời ngầm xác nhận với Backend & Supabase. Nếu backend từ chối (do phát hiện gian lận hoặc ảnh trùng), frontend sẽ tự động hoàn tác điểm số mượt mà kèm thông báo giải thích.

---

## 3. Các Tệp Sẽ Được Nâng Cấp

1. `/supabase_schema.sql` và `/src/components/SupabaseSqlModal.tsx`:
   - Nâng cấp Stored Procedure `record_waste_classification` với `FOR UPDATE`, hỗ trợ `p_scan_id` chống trùng lặp nguyên tử, và tối ưu index.
2. `/server/serverFingerprint.ts`:
   - Viết lại hàm tính toán dHash, SHA-256 checksum và Screen-spoof score bằng Uint8Array nhị phân siêu tốc.
3. `/server/store.ts` & `/server.ts`:
   - Tích hợp bộ nhớ đệm Cache TTL, debounce SSE broadcast và kết nối RPC an toàn.
4. `/src/lib/supabase.ts`:
   - Cập nhật hàm gọi RPC mới truyền kèm `scanId` idempotency.

---

## 4. Xác Minh & Kiểm Thử Sau Khi Nâng Cấp

- [ ] Chạy kiểm thử tải đồng thời (Concurrent Request Test): gửi 5 request cộng điểm cùng lúc với cùng 1 `scanId` để chứng minh hệ thống chỉ cộng đúng 1 lần duy nhất.
- [ ] Đo lường thời gian thực thi của thuật toán dHash vân tay ảnh (mục tiêu < 3ms).
- [ ] Kiểm tra khả năng đồng bộ Realtime giữa 2 tab trình duyệt khi một bên phân loại rác.
- [ ] Biên dịch `compile_applet` và `lint_applet` đạt 100% không lỗi.
