import React, { useState } from 'react';
import { Database, Copy, Check, X, ShieldCheck, Key, RefreshCw, Terminal, ExternalLink, CheckCircle2, AlertCircle, Settings, Save, RotateCcw } from 'lucide-react';
import { isSupabaseConfigured, getEffectiveSupabaseConfig, getSupabase, updateSupabaseConfig } from '../lib/supabase';
import { playClickSound } from '../utils/audio';

interface SupabaseSqlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SUPABASE_SQL_CODE = `-- ==============================================================================
-- ECOSORT AI - SUPABASE DATABASE SCHEMA & BẢO MẬT ROW LEVEL SECURITY (RLS)
-- Dự án: Hệ Thống Phân Loại Rác Thông Minh Tích Điểm STEM
-- ==============================================================================
-- Hướng dẫn cài đặt nhanh:
-- 1. Đăng nhập https://supabase.com và tạo một Project mới (hoặc chọn Project của bạn).
-- 2. Vào menu bên trái chọn "SQL Editor" -> bấm "New Query".
-- 3. Dán toàn bộ nội dung script này vào và bấm nút "Run" (hoặc Ctrl + Enter).
-- 4. Bảng 'players', 'classification_logs', 'waste_reports', 'scan_quotas', 
--    'pending_scans', 'image_fingerprints', 'waste_misclassifications' và các hàm RPC
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
  scan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_user 
  ON public.classification_logs (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_scan_id 
  ON public.classification_logs (scan_id) 
  WHERE scan_id IS NOT NULL;

-- Index lọc tối ưu hóa cho Top bảng xếp hạng (Partial Index)
CREATE INDEX IF NOT EXISTS idx_players_top_ranks 
  ON public.players (total_points DESC, correct_count DESC)
  WHERE total_points > 0;

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waste_reports_created 
  ON public.waste_reports (created_at DESC);

-- Trigger tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_players_updated_at ON public.players;
CREATE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

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
-- 6. HÀM TÍCH ĐIỂM BẢO MẬT VỚI ROW-LEVEL LOCKING & CHỐNG RACE CONDITION (RPC)
-- Ngăn chặn người dùng sửa điểm qua console và chống spam request đồng thời.
-- Quy tắc điểm chuẩn: Hữu cơ = 1đ, Tái chế = 2đ, Vô cơ = 3đ.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_waste_classification(
  p_item_name TEXT,
  p_category TEXT,
  p_points INT,
  p_source TEXT DEFAULT 'webcam',
  p_confidence NUMERIC DEFAULT 0.95,
  p_user_id TEXT DEFAULT NULL,
  p_scan_id TEXT DEFAULT NULL
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
  v_existing_log RECORD;
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

  -- 2. Kiểm tra Idempotency nguyên tử: nếu scan_id đã được ghi nhận điểm, không cộng lần 2
  IF p_scan_id IS NOT NULL AND p_scan_id <> '' THEN
    SELECT * INTO v_existing_log 
    FROM public.classification_logs 
    WHERE scan_id = p_scan_id 
    LIMIT 1;
    
    IF FOUND THEN
      SELECT * INTO v_updated_user FROM public.players WHERE id = v_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'awarded_points', v_existing_log.points_awarded,
        'total_points', COALESCE(v_updated_user.total_points, 0),
        'correct_count', COALESCE(v_updated_user.correct_count, 0),
        'username', COALESCE(v_updated_user.username, 'Thí sinh STEM')
      );
    END IF;
  END IF;

  -- 3. Quy chuẩn điểm theo loại rác STEM
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

  -- 4. Khóa hàng người chơi (ROW-LEVEL LOCK FOR UPDATE) chống race condition
  PERFORM 1 FROM public.players WHERE id = v_user_id FOR UPDATE;

  -- 5. Cập nhật điểm trực tiếp vào bảng players
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

  -- 6. Ghi lịch sử phân loại vào classification_logs kèm scan_id duy nhất
  INSERT INTO public.classification_logs (
    user_id,
    item_name,
    category,
    points_awarded,
    source,
    confidence,
    scan_id
  ) VALUES (
    v_user_id,
    p_item_name,
    p_category,
    p_points,
    COALESCE(p_source, 'webcam'),
    COALESCE(p_confidence, 0.95),
    p_scan_id
  );

  -- 7. Trả về kết quả cập nhật mới nhất
  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'awarded_points', p_points,
    'total_points', v_updated_user.total_points,
    'correct_count', v_updated_user.correct_count,
    'username', v_updated_user.username
  );
END;
$$;

-- Hàm tương thích ngược 6 tham số
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
BEGIN
  RETURN public.record_waste_classification(
    p_item_name,
    p_category,
    p_points,
    p_source,
    p_confidence,
    p_user_id,
    NULL
  );
END;
$$;

-- Cấp quyền chạy Stored Procedure cho tất cả client
GRANT EXECUTE ON FUNCTION public.record_waste_classification(TEXT, TEXT, INT, TEXT, NUMERIC, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_waste_classification(TEXT, TEXT, INT, TEXT, NUMERIC, TEXT) TO anon, authenticated, service_role;

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

-- ==============================================================================
-- 8. BẢNG QUẢN LÝ HẠN MỨC QUÉT NGÀY (public.scan_quotas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.scan_quotas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date_key TEXT NOT NULL, -- Định dạng YYYY-MM-DD theo múi giờ Asia/Ho_Chi_Minh
  used_scans INTEGER NOT NULL DEFAULT 0 CHECK (used_scans >= 0),
  remaining_scans INTEGER NOT NULL DEFAULT 30 CHECK (remaining_scans >= 0),
  last_scan_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_quotas_user_date 
  ON public.scan_quotas (user_id, date_key);

ALTER TABLE public.scan_quotas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow quotas all" ON public.scan_quotas;

-- ==============================================================================
-- 9. BẢNG PHIÊN QUÉT CHỜ NGHIỆM THU (public.pending_scans)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pending_scans (
  scan_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('organic', 'recyclable', 'inorganic')),
  points INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC(4, 2) DEFAULT 0.95,
  is_waste BOOLEAN NOT NULL DEFAULT true,
  is_uncertain BOOLEAN NOT NULL DEFAULT false,
  is_hazardous_or_special BOOLEAN NOT NULL DEFAULT false,
  requires_rescan_empty BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_scans_user 
  ON public.pending_scans (user_id, status);

ALTER TABLE public.pending_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow pending_scans all" ON public.pending_scans;

-- ==============================================================================
-- 10. BẢNG DẤU VÂN TAY ẢNH CHỐNG GIAN LẬN (public.image_fingerprints)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.image_fingerprints (
  id TEXT PRIMARY KEY,
  scan_id TEXT,
  user_id TEXT,
  user_name TEXT,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  checksum TEXT NOT NULL,
  d_hash TEXT NOT NULL,
  a_hash TEXT,
  center_d_hash TEXT,
  quadrant_hashes TEXT[],
  color_bins NUMERIC[],
  thumbnail TEXT,
  detection_tier TEXT,
  screen_spoof_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fingerprints_checksum 
  ON public.image_fingerprints (checksum);

ALTER TABLE public.image_fingerprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow image_fingerprints all" ON public.image_fingerprints;

-- ==============================================================================
-- 11. BẢNG TIẾP NHẬN PHẢN HỒI NHẬN NHẦM (public.waste_misclassifications)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.waste_misclassifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT,
  user_name TEXT,
  item_name TEXT NOT NULL,
  ai_category TEXT NOT NULL,
  ai_confidence NUMERIC,
  user_suggested_category TEXT NOT NULL,
  user_note TEXT,
  thumbnail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.waste_misclassifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow waste_misclassifications all" ON public.waste_misclassifications;

-- Thu hồi quyền truy cập trực tiếp các bảng nội bộ khỏi anon/authenticated
REVOKE ALL ON TABLE
  public.scan_quotas,
  public.pending_scans,
  public.image_fingerprints,
  public.waste_misclassifications
FROM anon, authenticated;

-- ==============================================================================
-- 12. HÀM RESET TOÀN BỘ ĐIỂM CHO CUỘC THI MỚI (RPC: reset_all_player_points)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reset_all_player_points()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.players
  SET
    total_points = 0,
    correct_count = 0,
    organic_count = 0,
    recyclable_count = 0,
    inorganic_count = 0,
    updated_at = NOW()
  WHERE id IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Đã đặt điểm toàn bộ thí sinh về 0 thành công.',
    'affected_players', v_count
  );
END;
$$;

-- Bảo vệ hàm reset điểm: Chỉ service_role (quản trị viên cấp cao) mới được chạy
REVOKE ALL ON FUNCTION public.reset_all_player_points() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_all_player_points() TO service_role;
`;

export const SupabaseSqlModal: React.FC<SupabaseSqlModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'success' | 'warning' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });

  const isConfigured = isSupabaseConfigured();
  const { url: currentUrl, anonKey: currentAnonKey } = getEffectiveSupabaseConfig();

  const [inputUrl, setInputUrl] = useState(currentUrl || '');
  const [inputAnonKey, setInputAnonKey] = useState(currentAnonKey || '');
  const [showConfigInputs, setShowConfigInputs] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const projectRefMatch = (inputUrl || currentUrl) ? (inputUrl || currentUrl).match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i) : null;
  const sqlEditorUrl = projectRefMatch 
    ? `https://supabase.com/dashboard/project/${projectRefMatch[1]}/sql/new` 
    : 'https://supabase.com/dashboard';

  const handleCopy = () => {
    playClickSound();
    navigator.clipboard.writeText(SUPABASE_SQL_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveConfig = () => {
    playClickSound();
    updateSupabaseConfig(inputUrl.trim(), inputAnonKey.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    // Auto test after saving
    handleTestConnection();
  };

  const handleTestConnection = async () => {
    playClickSound();
    setTesting(true);
    setTestResult({ status: 'idle', message: 'Đang kiểm tra kết nối tới Supabase...' });

    try {
      const client = getSupabase();
      if (!client) {
        setTestResult({
          status: 'error',
          message: 'Chưa cấu hình Supabase URL hoặc Anon Key mới. Vui lòng gửi URL và Key mới để thiết lập.',
        });
        setTesting(false);
        return;
      }

      // Query players table
      const { error } = await client.from('players').select('id', { count: 'exact', head: true });

      if (!error) {
        setTestResult({
          status: 'success',
          message: 'Kết nối thành công! Bảng public.players, classification_logs và RLS đã sẵn sàng hoạt động.',
        });
      } else if (error.code === '42P01') {
        // Table does not exist yet
        setTestResult({
          status: 'warning',
          message: 'Đã kết nối máy chủ Supabase thành công, nhưng bảng "players" chưa được tạo! Hãy dán mã SQL bên dưới vào SQL Editor của Project mới và nhấn Run.',
        });
      } else {
        setTestResult({
          status: 'warning',
          message: `Máy chủ phản hồi: ${error.message} (${error.code || 'Notice'}). Hãy dán mã SQL bên dưới và nhấn Run.`,
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: 'Lỗi kết nối: ' + (err.message || String(err)),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border-2 border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
                <span>SQL Schema & Bảo Mật Row Level Security (RLS) Mới</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isConfigured
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isConfigured ? '🟢 Đã kết nối Supabase Mới' : '🟡 Đang chờ kết nối Supabase Mới'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Toàn bộ mã SQL tạo Database, Bảng xếp hạng online, và Stored Procedure chống sửa điểm
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project Info & Live Connection Test */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700/80">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">Trạng thái kết nối:</span>
                {isConfigured ? (
                  <code className="text-xs font-mono text-emerald-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 select-all">
                    {currentUrl}
                  </code>
                ) : (
                  <span className="text-xs text-amber-400 font-semibold">
                    Đã gỡ bỏ toàn bộ URL & API Key cũ. Sẵn sàng nhận dự án mới!
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                {isConfigured
                  ? 'Đã cấu hình dự án Supabase mới. Bạn có thể bấm kiểm tra kết nối ngay.'
                  : 'Hãy dán mã SQL bên dưới vào Project Supabase mới của bạn và gửi URL cùng Anon Key mới.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setShowConfigInputs(!showConfigInputs);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-slate-200 font-bold text-xs transition-all cursor-pointer active:scale-95"
              >
                <Settings className="w-3.5 h-3.5 text-cyan-400" />
                <span>{showConfigInputs ? 'Ẩn cấu hình URL/Key' : 'Đổi URL & API Key'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-300 font-bold text-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Đang thử...' : 'Kiểm tra kết nối'}</span>
              </button>

              <a
                href={sqlEditorUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 transition-all cursor-pointer"
              >
                <span>Mở SQL Editor</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Collapsible Supabase Project Config Form */}
          {showConfigInputs && (
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-cyan-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Cập nhật Thông tin Supabase Project Mới:</span>
                </span>
                {savedSuccess && (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Đã lưu thành công!
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    1. Supabase Project URL (Dạng: <code>https://abcdefghijkl.supabase.co</code>)
                  </label>
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://xyzabcdef.supabase.co"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-emerald-300 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    2. Supabase Anon Public API Key (Dạng: <code>eyJhbGciOiJIUzI1Ni...</code>)
                  </label>
                  <textarea
                    rows={2}
                    value={inputAnonKey}
                    onChange={(e) => setInputAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-emerald-300 focus:outline-none focus:border-cyan-400 transition-colors resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    updateSupabaseConfig('', '');
                    setInputUrl('');
                    setInputAnonKey('');
                    setSavedSuccess(true);
                    setTimeout(() => setSavedSuccess(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Xóa URL & Key (Đặt lại)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md shadow-cyan-950/50 transition-all cursor-pointer active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu & Kiểm tra kết nối</span>
                </button>
              </div>
            </div>
          )}

          {testResult.message && (
            <div
              className={`p-2.5 rounded-xl text-xs flex items-start gap-2 border ${
                testResult.status === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : testResult.status === 'warning'
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
              }`}
            >
              {testResult.status === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium leading-relaxed">{testResult.message}</div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="p-3 bg-slate-950/40 border-b border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Bước 1: Chạy mã SQL</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Bấm <strong>"Sao chép toàn bộ SQL"</strong>, vào <strong>SQL Editor</strong> trong Supabase mới, dán vào và nhấn <strong>Run</strong>.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Bước 2: Lấy Khóa API</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Vào <strong>Project Settings &gt; API</strong>, lấy <code>Project URL</code> và <code>anon public key</code> mới.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Bước 3: Tắt Confirm Email</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Vào <strong>Authentication &gt; Providers &gt; Email</strong>, bỏ chọn <strong>"Confirm email"</strong> để tránh lỗi <em>email rate limit exceeded</em> khi thí sinh đăng ký hàng loạt.
            </p>
          </div>
        </div>

        {/* Code View with Copy CTA */}
        <div className="relative flex-1 overflow-hidden flex flex-col bg-slate-950">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs">
            <span className="font-mono text-slate-400">supabase_schema.sql</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/50 transition-all cursor-pointer active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Đã sao chép!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép toàn bộ SQL</span>
                </>
              )}
            </button>
          </div>

          <pre className="flex-1 p-4 text-[11px] font-mono text-emerald-300 overflow-y-auto overflow-x-auto leading-relaxed selection:bg-emerald-800 selection:text-white">
            {SUPABASE_SQL_CODE}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400 text-[11px]">
            File này cũng được lưu trực tiếp tại thư mục gốc: <code className="text-emerald-400 font-mono">/supabase_schema.sql</code>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition-all cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
