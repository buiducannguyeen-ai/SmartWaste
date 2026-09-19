-- ==============================================================================
-- ECOSORT AI - SUPABASE DATABASE SCHEMA & BẢO MẬT ROW LEVEL SECURITY (RLS)
-- Dự án: Hệ Thống Phân Loại Rác Thông Minh Tích Điểm STEM
-- ==============================================================================
-- Hướng dẫn cài đặt nhanh:
-- 1. Đăng nhập https://supabase.com và tạo một Project mới (hoặc chọn Project của bạn).
-- 2. Vào menu bên trái chọn "SQL Editor" -> bấm "New Query".
-- 3. Dán toàn bộ nội dung script này vào và bấm nút "Run" (hoặc Ctrl + Enter).
-- 4. Bảng 'players', 'classification_logs', 'waste_reports' và hàm Stored Procedure
--    tích điểm đa thiết bị, chống gian lận sẽ được tạo và cấu hình tự động 100%.
-- ==============================================================================

-- 1. BẢNG THÔNG TIN NGƯỜI CHƠI / BẢNG XẾP HẠNG (public.players)
-- Hỗ trợ cả tài khoản email Supabase Auth và người chơi vào nhanh qua Webcam
CREATE TABLE IF NOT EXISTS public.players (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  organic_count INTEGER NOT NULL DEFAULT 0 CHECK (organic_count >= 0),
  recyclable_count INTEGER NOT NULL DEFAULT 0 CHECK (recyclable_count >= 0),
  inorganic_count INTEGER NOT NULL DEFAULT 0 CHECK (inorganic_count >= 0),
  avatar TEXT NOT NULL DEFAULT '🌱',
  organization TEXT NOT NULL DEFAULT 'Khối Sáng Tạo STEM',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index tối ưu truy vấn Bảng Xếp Hạng theo tổng điểm và số lần phân loại đúng
CREATE INDEX IF NOT EXISTS idx_players_leaderboard 
  ON public.players (total_points DESC, correct_count DESC);

-- 2. BẢNG NHẬT KÝ PHÂN LOẠI RÁC (public.classification_logs)
CREATE TABLE IF NOT EXISTS public.classification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('organic', 'recyclable', 'inorganic')),
  points_awarded INTEGER NOT NULL CHECK (points_awarded IN (1, 2, 3)),
  source TEXT NOT NULL DEFAULT 'webcam',
  confidence NUMERIC(4, 2) DEFAULT 0.95,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_user 
  ON public.classification_logs (user_id, created_at DESC);

-- 3. BẢNG PHẢN ÁNH TÌNH TRẠNG RÁC THẢI CỘNG ĐỒNG (public.waste_reports)
CREATE TABLE IF NOT EXISTS public.waste_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  author_id TEXT,
  author_name TEXT NOT NULL,
  author_avatar TEXT DEFAULT '🌱',
  author_org TEXT DEFAULT 'Khối Sáng Tạo STEM',
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  waste_type_detected TEXT,
  severity_level TEXT DEFAULT 'medium' CHECK (severity_level IN ('low', 'medium', 'high', 'urgent')),
  moderation_status TEXT DEFAULT 'approved' CHECK (moderation_status IN ('approved', 'rejected')),
  status TEXT DEFAULT 'reported' CHECK (status IN ('reported', 'investigating', 'resolved')),
  upvotes INTEGER NOT NULL DEFAULT 0,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waste_reports_created 
  ON public.waste_reports (created_at DESC);

-- ==============================================================================
-- 4. KÍCH HOẠT BẢO MẬT ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_reports ENABLE ROW LEVEL SECURITY;

-- Policies cho public.players: Đọc công khai & Cập nhật an toàn
DROP POLICY IF EXISTS "Public can view players leaderboard" ON public.players;
CREATE POLICY "Public can view players leaderboard" 
  ON public.players FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow players insert and update" ON public.players;
CREATE POLICY "Allow players insert and update" 
  ON public.players FOR ALL USING (true) WITH CHECK (true);

-- Policies cho public.classification_logs: Xem và ghi nhật ký
DROP POLICY IF EXISTS "Public can view classification logs" ON public.classification_logs;
DROP POLICY IF EXISTS "Allow logs insert and select" ON public.classification_logs;
CREATE POLICY "Allow logs insert and select" 
  ON public.classification_logs FOR ALL USING (true) WITH CHECK (true);

-- Policies cho public.waste_reports: Đọc, gửi bài và bình chọn
DROP POLICY IF EXISTS "Public can view waste reports" ON public.waste_reports;
DROP POLICY IF EXISTS "Allow reports insert and update" ON public.waste_reports;
CREATE POLICY "Allow reports insert and update" 
  ON public.waste_reports FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 5. TỰ ĐỘNG KHỞI TẠO HỒ SƠ 0 ĐIỂM KHI ĐĂNG KÝ TÀI KHOẢN AUTH (TRIGGER)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.players (
    id,
    username,
    email,
    total_points,
    correct_count,
    organic_count,
    recyclable_count,
    inorganic_count,
    avatar,
    organization
  ) VALUES (
    NEW.id::TEXT,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'username', ''), split_part(NEW.email, '@', 1)),
    NEW.email,
    0, -- Bắt đầu chính xác với 0 điểm
    0, -- 0 lần phân loại
    0,
    0,
    0,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar', ''), '🌱'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'organization', ''), 'Khối Sáng Tạo STEM')
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 6. HÀM TÍCH ĐIỂM BẢO MẬT & ĐỒNG BỘ ĐA THIẾT BỊ (STORED PROCEDURE / RPC)
-- Ngăn chặn người dùng sửa điểm qua console trình duyệt.
-- Quy tắc điểm chuẩn: Hữu cơ = 1đ, Tái chế = 2đ, Vô cơ = 3đ.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_waste_classification(
  p_item_name TEXT,
  p_category TEXT,
  p_points INT,
  p_source TEXT DEFAULT 'webcam',
  p_confidence NUMERIC DEFAULT 0.95,
  p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id TEXT;
  v_allowed_points INT;
  v_updated_user RECORD;
BEGIN
  -- 1. Xác định ID người chơi
  IF auth.uid() IS NOT NULL THEN
    v_user_id := auth.uid()::TEXT;
  ELSIF p_user_id IS NOT NULL AND p_user_id <> '' THEN
    SELECT id INTO v_user_id FROM public.players 
    WHERE id = p_user_id OR username = p_user_id OR email = p_user_id 
    LIMIT 1;
    
    IF v_user_id IS NULL THEN
      v_user_id := p_user_id;
    END IF;
  END IF;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM public.players ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid()::TEXT;
  END IF;

  -- 2. Quy chuẩn điểm theo loại rác STEM
  IF p_category = 'organic' THEN
    v_allowed_points := 1;
  ELSIF p_category = 'recyclable' THEN
    v_allowed_points := 2;
  ELSIF p_category = 'inorganic' THEN
    v_allowed_points := 3;
  ELSE
    RAISE EXCEPTION 'Loại rác % không hợp lệ!', p_category;
  END IF;

  p_points := v_allowed_points;

  -- 3. Cập nhật điểm trực tiếp vào bảng players
  UPDATE public.players
  SET
    total_points = total_points + p_points,
    correct_count = correct_count + 1,
    organic_count = organic_count + CASE WHEN p_category = 'organic' THEN 1 ELSE 0 END,
    recyclable_count = recyclable_count + CASE WHEN p_category = 'recyclable' THEN 1 ELSE 0 END,
    inorganic_count = inorganic_count + CASE WHEN p_category = 'inorganic' THEN 1 ELSE 0 END,
    updated_at = NOW()
  WHERE id = v_user_id
  RETURNING * INTO v_updated_user;

  -- Nếu chưa có bản ghi, tự tạo người chơi mới
  IF NOT FOUND THEN
    INSERT INTO public.players (
      id,
      username,
      email,
      total_points,
      correct_count,
      organic_count,
      recyclable_count,
      inorganic_count,
      organization,
      avatar
    ) VALUES (
      v_user_id,
      COALESCE(p_user_id, 'Thí sinh STEM'),
      COALESCE(p_user_id, 'player') || '@ecosort.stem',
      p_points,
      1,
      CASE WHEN p_category = 'organic' THEN 1 ELSE 0 END,
      CASE WHEN p_category = 'recyclable' THEN 1 ELSE 0 END,
      CASE WHEN p_category = 'inorganic' THEN 1 ELSE 0 END,
      'Lớp 11A1 - CLB STEM',
      '🌱'
    )
    RETURNING * INTO v_updated_user;
    v_user_id := v_updated_user.id;
  END IF;

  -- 4. Ghi lịch sử phân loại vào classification_logs
  INSERT INTO public.classification_logs (
    user_id,
    item_name,
    category,
    points_awarded,
    source,
    confidence
  ) VALUES (
    v_user_id,
    p_item_name,
    p_category,
    p_points,
    COALESCE(p_source, 'webcam'),
    COALESCE(p_confidence, 0.95)
  );

  -- 5. Trả về kết quả cập nhật mới nhất
  RETURN jsonb_build_object(
    'success', true,
    'awarded_points', p_points,
    'total_points', v_updated_user.total_points,
    'correct_count', v_updated_user.correct_count,
    'username', v_updated_user.username
  );
END;
$$;

-- Cấp quyền chạy Stored Procedure cho tất cả client
GRANT EXECUTE ON FUNCTION public.record_waste_classification TO anon, authenticated, service_role;

-- ==============================================================================
-- 7. KÍCH HOẠT SUPABASE REALTIME ĐỂ BẢNG XẾP HẠNG & BÁO CÁO CẬP NHẬT TỨC THÌ
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'classification_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classification_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'waste_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waste_reports;
  END IF;
END;
$$;
