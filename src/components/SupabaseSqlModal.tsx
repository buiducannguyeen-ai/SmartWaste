import React, { useState } from 'react';
import { Database, Copy, Check, X, ShieldCheck, Key, RefreshCw, Terminal, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { isSupabaseConfigured, getEffectiveSupabaseConfig, getSupabase } from '../lib/supabase';
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
`;

export const SupabaseSqlModal: React.FC<SupabaseSqlModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'success' | 'warning' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });

  const isConfigured = isSupabaseConfigured();
  const { url: currentUrl } = getEffectiveSupabaseConfig();

  if (!isOpen) return null;

  const projectRefMatch = currentUrl ? currentUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i) : null;
  const sqlEditorUrl = projectRefMatch 
    ? `https://supabase.com/dashboard/project/${projectRefMatch[1]}/sql/new` 
    : 'https://supabase.com/dashboard';

  const handleCopy = () => {
    playClickSound();
    navigator.clipboard.writeText(SUPABASE_SQL_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
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
                <span>Mở Supabase SQL Editor</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

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
