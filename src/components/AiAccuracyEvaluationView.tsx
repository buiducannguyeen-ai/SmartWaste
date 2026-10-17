import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Camera,
  Upload,
  Download,
  RefreshCw,
  Lock,
  Unlock,
  Trash2,
  Edit3,
  Plus,
  FileSpreadsheet,
  Sparkles,
  ShieldAlert,
  Info,
  ChevronRight,
  Eye,
  EyeOff,
  BarChart3,
  Check,
  X,
  FileText,
  RotateCcw,
} from 'lucide-react';
import {
  BenchmarkCategory,
  BenchmarkTestSample,
  BenchmarkStats,
  EdgeCaseType,
  HandlingSuitability,
} from '../types';
import {
  BENCHMARK_CATEGORIES,
  EDGE_CASE_PRESETS,
  loadBenchmarkSamples,
  saveBenchmarkSamples,
  clearBenchmarkSamples,
  generateEmptyStemPresets,
  calculateBenchmarkStats,
  exportBenchmarkToCsv,
  exportBenchmarkToJson,
  mapAiResultToBenchmarkCategory,
} from '../utils/benchmarkStorage';
import { playClickSound, playPointSound, playVictorySound, playWarningSound } from '../utils/audio';
import {
  evaluatorLoginApi,
  checkEvaluatorAuthApi,
  getEvaluatorToken,
  clearEvaluatorToken,
} from '../lib/authApi';

export const AiAccuracyEvaluationView: React.FC = () => {
  const [samples, setSamples] = useState<BenchmarkTestSample[]>(() => loadBenchmarkSamples());
  const [activeFilter, setActiveFilter] = useState<'all' | 'tested' | 'untested' | 'edge_cases' | BenchmarkCategory>('all');
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [processingSampleId, setProcessingSampleId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // Evaluator authentication state (Strict Role & Session Verification)
  const [isEvaluatorAuthed, setIsEvaluatorAuthed] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authPasskeyInput, setAuthPasskeyInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);

  useEffect(() => {
    checkEvaluatorAuthApi().then((authed) => {
      setIsEvaluatorAuthed(authed);
      setIsCheckingAuth(false);
    });
  }, []);

  const handleEvaluatorAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authPasskeyInput.trim()) {
      setAuthError('Vui lòng nhập mã bí mật của giám khảo / giáo viên ban tổ chức.');
      return;
    }
    setIsSubmittingAuth(true);
    setAuthError(null);
    const res = await evaluatorLoginApi(authPasskeyInput.trim());
    setIsSubmittingAuth(false);
    if (res.success) {
      setIsEvaluatorAuthed(true);
      setShowAuthModal(false);
      setAuthPasskeyInput('');
      playVictorySound();
    } else {
      setAuthError(res.error || 'Mã xác thực không chính xác. Vui lòng liên hệ ban tổ chức.');
      playWarningSound();
    }
  };

  const handleLockEvaluator = () => {
    clearEvaluatorToken();
    setIsEvaluatorAuthed(false);
    playClickSound();
  };

  // Modals state
  const [isProtocolModalOpen, setIsProtocolModalOpen] = useState(false);
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingSample, setEditingSample] = useState<BenchmarkTestSample | null>(null);
  const [isWebcamModalOpen, setIsWebcamModalOpen] = useState(false);
  const [webcamTargetSampleId, setWebcamTargetSampleId] = useState<string | null>(null);

  // Form state for add/edit modal
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<BenchmarkCategory>('recyclable');
  const [formNotes, setFormNotes] = useState('');
  const [formIsEdgeCase, setFormIsEdgeCase] = useState(false);
  const [formEdgeCaseType, setFormEdgeCaseType] = useState<EdgeCaseType>('none');
  const [formImage, setFormImage] = useState<string>('');
  const [formLockGroundTruth, setFormLockGroundTruth] = useState(true);

  // Hidden file input for uploading images
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetSampleId, setUploadTargetSampleId] = useState<string | null>(null);

  // Webcam stream state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // Save to localStorage on changes
  useEffect(() => {
    saveBenchmarkSamples(samples);
  }, [samples]);

  // Calculate live stats based strictly on ACTUAL empirical tests
  const stats: BenchmarkStats = useMemo(() => {
    return calculateBenchmarkStats(samples);
  }, [samples]);

  // Filtered samples
  const filteredSamples = useMemo(() => {
    return samples.filter((s) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'tested') return s.hasRunAI;
      if (activeFilter === 'untested') return !s.hasRunAI;
      if (activeFilter === 'edge_cases') return s.isDifficultOrEdgeCase;
      return s.groundTruthCategory === activeFilter;
    });
  }, [samples, activeFilter]);

  // Handle initializing 30 preset empty sample slots
  const handleInitPresets = () => {
    if (samples.length > 0) {
      if (!window.confirm('Hành động này sẽ thay thế danh sách hiện tại bằng bộ 30 khung mẫu chuẩn STEM (10 Hữu cơ, 10 Tái chế, 10 Vô cơ/Nguy hại). Bạn có chắc chắn không?')) {
        return;
      }
    }
    const presets = generateEmptyStemPresets();
    setSamples(presets);
    playPointSound(2);
  };

  // Run single AI test
  const runAiTestForSample = async (sampleId: string) => {
    const target = samples.find((s) => s.id === sampleId);
    if (!target) return;
    if (!target.image) {
      alert('Vui lòng chụp ảnh hoặc tải ảnh vật thể thực tế trước khi chạy kiểm thử AI.');
      return;
    }

    const evalToken = getEvaluatorToken();
    if (!isEvaluatorAuthed || !evalToken) {
      setShowAuthModal(true);
      setAuthError('Yêu cầu xác thực quyền Giám Khảo / Giáo Viên trước khi chạy kiểm thử AI.');
      return;
    }

    setProcessingSampleId(sampleId);
    try {
      const response = await fetch('/api/classify-waste', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-benchmark-auth': evalToken,
        },
        body: JSON.stringify({
          image: target.image,
          isBenchmark: true, // Bypass anti-cheat duplicate checking & isolate from student points
          originalItemName: target.itemName,
        }),
      });

      if (response.status === 403) {
        clearEvaluatorToken();
        setIsEvaluatorAuthed(false);
        setShowAuthModal(true);
        setAuthError('Quyền kiểm thử bị từ chối hoặc mã xác thực đã hết hạn. Vui lòng xác thực lại.');
        return;
      }

      const resData = await response.json();
      if (!resData.success && !resData.data) {
        throw new Error(resData.error || 'AI không phản hồi hoặc hình ảnh không hợp lệ');
      }

      const aiData = resData.data || {};
      const predictedCategory = mapAiResultToBenchmarkCategory(aiData);

      // Determine default handling suitability: if steps provided, default to unreviewed for teacher audit
      const aiSteps = Array.isArray(aiData.preparationSteps) ? aiData.preparationSteps : [];
      let handlingSummary = '';
      if (aiSteps.length > 0) {
        handlingSummary = aiSteps.map((st: any) => st.instruction).join(' | ');
      } else if (aiData.recyclingTip) {
        handlingSummary = aiData.recyclingTip;
      }

      setSamples((prev) =>
        prev.map((s) => {
          if (s.id !== sampleId) return s;
          return {
            ...s,
            hasRunAI: true,
            predictedCategory,
            aiConfidence: typeof aiData.confidence === 'number' ? aiData.confidence : 0,
            isUncertain: Boolean(aiData.isUncertain || resData.isUncertain),
            uncertaintyReason: aiData.uncertaintyReason || '',
            isHazardousOrSpecial: Boolean(aiData.isHazardousOrSpecial),
            hasLiquid: Boolean(aiData.hasLiquid),
            requiresRescanEmpty: Boolean(aiData.requiresRescanEmpty),
            rawAiCategory: aiData.category,
            aiRecommendedSteps: aiSteps,
            aiHandlingSummary: handlingSummary,
            specialHandlingNotice: aiData.specialHandlingNotice,
            handlingSuitability: s.handlingSuitability !== 'unreviewed' ? s.handlingSuitability : 'unreviewed',
            evaluatedAt: Date.now(),
          };
        })
      );
      playPointSound(2);
    } catch (err: any) {
      console.error('Lỗi chạy kiểm thử AI cho mẫu:', err);
      alert(`Lỗi kiểm thử AI: ${err.message || 'Không thể kết nối máy chủ'}`);
    } finally {
      setProcessingSampleId(null);
    }
  };

  // Run batch AI test for all samples with images that haven't been run or need rerun
  const runBatchAiTest = async () => {
    const evalToken = getEvaluatorToken();
    if (!isEvaluatorAuthed || !evalToken) {
      setShowAuthModal(true);
      setAuthError('Yêu cầu xác thực quyền Giám Khảo / Giáo Viên trước khi chạy kiểm thử hàng loạt.');
      return;
    }

    const readySamples = samples.filter((s) => s.image && (!s.hasRunAI || s.isUncertain));
    if (readySamples.length === 0) {
      alert('Không có mẫu nào có ảnh đang chờ kiểm thử AI. Hãy chụp hoặc tải ảnh cho các mẫu trước.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn chạy kiểm thử AI tự động cho ${readySamples.length} mẫu có ảnh?`)) {
      return;
    }

    setIsProcessingBatch(true);
    setBatchProgress({ current: 0, total: readySamples.length });

    for (let i = 0; i < readySamples.length; i++) {
      const s = readySamples[i];
      setBatchProgress({ current: i + 1, total: readySamples.length });
      await runAiTestForSample(s.id);
      // Small pause between inference calls
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    setIsProcessingBatch(false);
    setBatchProgress(null);
    playVictorySound();
  };

  // Handling suitability evaluator review
  const updateHandlingReview = (sampleId: string, suitability: HandlingSuitability) => {
    playClickSound();
    setSamples((prev) =>
      prev.map((s) => (s.id === sampleId ? { ...s, handlingSuitability: suitability } : s))
    );
  };

  // Update evaluator notes
  const updateEvaluatorNotes = (sampleId: string, notes: string) => {
    setSamples((prev) =>
      prev.map((s) => (s.id === sampleId ? { ...s, evaluatorHandlingNotes: notes } : s))
    );
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetSampleId) return;

    if (file.size > 20 * 1024 * 1024) {
      alert('Kích thước ảnh quá lớn (vui lòng chọn ảnh dưới 20MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (base64) {
        setSamples((prev) =>
          prev.map((s) => (s.id === uploadTargetSampleId ? { ...s, image: base64 } : s))
        );
        playPointSound(1);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setUploadTargetSampleId(null);
  };

  // Trigger file upload for a specific sample
  const triggerUploadForSample = (sampleId: string) => {
    setUploadTargetSampleId(sampleId);
    fileInputRef.current?.click();
  };

  // Webcam modal open/start
  const openWebcamForSample = async (sampleId: string) => {
    setWebcamTargetSampleId(sampleId);
    setWebcamError(null);
    setIsWebcamModalOpen(true);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('Lỗi mở camera:', err);
      setWebcamError('Không thể mở camera. Vui lòng cấp quyền camera trong trình duyệt hoặc sử dụng tính năng tải ảnh.');
    }
  };

  // Close webcam
  const closeWebcam = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsWebcamModalOpen(false);
    setWebcamTargetSampleId(null);
  };

  // Capture photo from webcam
  const captureWebcamPhoto = () => {
    if (!videoRef.current || !webcamTargetSampleId) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);

      setSamples((prev) =>
        prev.map((s) => (s.id === webcamTargetSampleId ? { ...s, image: base64 } : s))
      );
      playPointSound(1);
    }
    closeWebcam();
  };

  // Open modal to add or edit sample
  const openAddSampleModal = () => {
    const nextNum = samples.length + 1;
    const nextCode = `TST-${String(nextNum).padStart(3, '0')}`;
    setEditingSample(null);
    setFormCode(nextCode);
    setFormName('');
    setFormCategory('recyclable');
    setFormNotes('');
    setFormIsEdgeCase(false);
    setFormEdgeCaseType('none');
    setFormImage('');
    setFormLockGroundTruth(true);
    setIsAddEditModalOpen(true);
  };

  const openEditSampleModal = (sample: BenchmarkTestSample) => {
    setEditingSample(sample);
    setFormCode(sample.sampleCode);
    setFormName(sample.itemName);
    setFormCategory(sample.groundTruthCategory);
    setFormNotes(sample.groundTruthNotes || '');
    setFormIsEdgeCase(Boolean(sample.isDifficultOrEdgeCase));
    setFormEdgeCaseType(sample.edgeCaseType || 'none');
    setFormImage(sample.image || '');
    setFormLockGroundTruth(sample.isGroundTruthLocked);
    setIsAddEditModalOpen(true);
  };

  const handleSaveSample = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Vui lòng nhập tên vật thể kiểm thử.');
      return;
    }

    if (editingSample) {
      // Update existing
      setSamples((prev) =>
        prev.map((s) => {
          if (s.id !== editingSample.id) return s;
          return {
            ...s,
            sampleCode: formCode.trim() || s.sampleCode,
            itemName: formName.trim(),
            groundTruthCategory: formCategory,
            groundTruthNotes: formNotes.trim(),
            isDifficultOrEdgeCase: formIsEdgeCase,
            edgeCaseType: formEdgeCaseType,
            image: formImage || s.image,
            isGroundTruthLocked: formLockGroundTruth,
          };
        })
      );
    } else {
      // Add new
      const newSample: BenchmarkTestSample = {
        id: `bench-sample-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sampleCode: formCode.trim() || `TST-${String(samples.length + 1).padStart(3, '0')}`,
        itemName: formName.trim(),
        groundTruthCategory: formCategory,
        groundTruthNotes: formNotes.trim(),
        isDifficultOrEdgeCase: formIsEdgeCase,
        edgeCaseType: formEdgeCaseType,
        image: formImage || undefined,
        isGroundTruthLocked: formLockGroundTruth,
        hasRunAI: false,
        handlingSuitability: 'unreviewed',
        createdAt: Date.now(),
      };
      setSamples((prev) => [...prev, newSample]);
    }

    setIsAddEditModalOpen(false);
    playPointSound(1);
  };

  const handleDeleteSample = (sampleId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa mẫu kiểm thử này?')) {
      setSamples((prev) => prev.filter((s) => s.id !== sampleId));
      playClickSound();
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ danh sách kiểm thử thực nghiệm?')) {
      clearBenchmarkSamples();
      setSamples([]);
      playClickSound();
    }
  };

  // Quick preset template filler helper for Difficult Items
  const applyEdgeCaseTemplate = (type: EdgeCaseType) => {
    const preset = EDGE_CASE_PRESETS.find((p) => p.type === type);
    if (!preset) return;
    setFormName(preset.sampleName);
    setFormCategory(preset.defaultCategory);
    setFormNotes(preset.note);
    setFormIsEdgeCase(true);
    setFormEdgeCaseType(type);
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Lab Banner Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-cyan-950/70 via-slate-900 to-emerald-950/70 border border-slate-800 p-5 sm:p-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold">
              <FlaskConical className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>PHÒNG THÍ NGHIỆM ĐÁNH GIÁ ĐỘ CHÍNH XÁC AI &bull; STEM EVALUATION BENCHMARK LAB</span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-100 tracking-tight">
              Đánh Giá Thực Nghiệm Độ Chính Xác AI SmartWaste
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Quy chuẩn kiểm thử mù đôi (<strong className="text-cyan-300">Ground-Truth First</strong>) trên bộ 30 mẫu vật thể thực tế mới (10 Hữu cơ, 10 Tái chế, 10 Vô cơ/Nguy hại). Đo lường trung thực độ tin cậy AI và độ chính xác thực nghiệm, hỗ trợ nghiệm thu báo cáo đề tài STEM.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="btn-protocol-guide"
              type="button"
              onClick={() => {
                playClickSound();
                setIsProtocolModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-850 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 shadow-sm active:scale-95 transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Quy Trình Kiểm Thử</span>
            </button>

            {/* Evaluator Auth Status Badge / Button */}
            {isEvaluatorAuthed ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Giám Khảo Đã Xác Thực</span>
                <button
                  type="button"
                  onClick={handleLockEvaluator}
                  title="Khóa lại quyền giám khảo"
                  className="ml-1 text-slate-400 hover:text-rose-400 text-[11px] underline cursor-pointer"
                >
                  Khóa
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setShowAuthModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 shadow-sm active:scale-95 transition-all"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Xác Thực Giám Khảo</span>
              </button>
            )}

            <button
              id="btn-export-csv"
              type="button"
              onClick={() => {
                playClickSound();
                exportBenchmarkToCsv(samples, stats);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/50 active:scale-95 transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Xuất Báo Cáo CSV</span>
            </button>

            <button
              id="btn-add-sample"
              type="button"
              onClick={() => {
                playClickSound();
                openAddSampleModal();
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 shadow-md shadow-cyan-500/25 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Mẫu Mới</span>
            </button>

            {samples.length === 0 && (
              <button
                id="btn-init-presets"
                type="button"
                onClick={handleInitPresets}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md active:scale-95 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Khởi Tạo 30 Khung Mẫu Chuẩn STEM</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empirical Accuracy & Metric Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tiến độ mẫu */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
              <span>Tiến Độ Kiểm Thử</span>
              <span className="font-mono text-cyan-300">{stats.actualTestedCount} / {stats.targetCount} mẫu</span>
            </div>
            <div className="text-2xl font-black text-slate-100 font-mono">
              {Math.round((stats.actualTestedCount / stats.targetCount) * 100)}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {stats.actualCreatedCount} mẫu đã đăng ký &bull; Mục tiêu 30 mẫu
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2.5 mt-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-teal-400 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((stats.actualTestedCount / stats.targetCount) * 100))}%` }}
            />
          </div>
        </div>

        {/* Card 2: Độ chính xác thực nghiệm (Ground Truth Match) */}
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 shadow-lg flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold mb-1">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Độ Chính Xác Thực Nghiệm
              </span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40">
                Ground Truth Match
              </span>
            </div>
            <div className="text-3xl font-black text-emerald-300 font-mono">
              {stats.actualTestedCount > 0 ? `${stats.empiricalAccuracyRate}%` : '---'}
            </div>
            <div className="text-[11px] text-slate-300 mt-1">
              {stats.correctCount} / {stats.actualTestedCount} mẫu trùng khớp nhãn chuẩn
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-800">
            <span className="text-emerald-400 font-bold">{stats.correctCount} đúng</span>
            <span className="text-rose-400 font-bold">{stats.incorrectCount} sai</span>
            <span className="text-amber-400 font-bold">{stats.uncertainOrRejectedCount} chưa chắc</span>
          </div>
        </div>

        {/* Card 3: Độ tin cậy trung bình AI */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
              <span>Độ Tin Cậy AI Trung Bình</span>
              <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/40">
                Model Confidence
              </span>
            </div>
            <div className="text-3xl font-black text-cyan-300 font-mono">
              {stats.actualTestedCount > 0 ? `${stats.averageAiConfidence}%` : '---'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 leading-snug">
              Mức độ chắc chắn trung bình của mạng nơ-ron AI trên các mẫu đã quét
            </div>
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80 mt-2">
            Phân biệt: <span className="text-emerald-300 font-bold">Chính xác</span> (đối soát nhãn thật) vs <span className="text-cyan-300 font-bold">Tin cậy</span> (AI tự lượng giá).
          </div>
        </div>

        {/* Card 4: Tỷ lệ hướng xử lý phù hợp */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
              <span>Hướng Xử Lý AI Đề Xuất</span>
              <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">
                STEM Action Audit
              </span>
            </div>
            <div className="text-3xl font-black text-indigo-300 font-mono">
              {stats.handlingStats.totalReviewed > 0 ? `${stats.handlingStats.suitabilityRate}%` : '---'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {stats.handlingStats.suitableCount} / {stats.handlingStats.totalReviewed} mẫu được đánh giá phù hợp
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-800">
            <span>Đã thẩm định: {stats.handlingStats.totalReviewed}</span>
            <span className="text-amber-400 font-semibold">{stats.handlingStats.needsAdjustmentCount} cần chỉnh</span>
          </div>
        </div>
      </div>

      {/* Category Accuracy Breakdown & Difficult Edge Cases Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left (7 Cols): Accuracy by 4 Categories */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-black text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Độ Chính Xác Thực Nghiệm Theo 4 Nhóm Rác
            </h2>
            <span className="text-[11px] text-slate-400">Chỉ tính trên mẫu đã quét AI thật</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BENCHMARK_CATEGORIES.map((cat) => {
              const metric = stats.categories[cat.key];
              const tested = metric.testedCount;
              const correct = metric.correctCount;
              const rate = metric.accuracyRate;

              return (
                <div key={cat.key} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${cat.badgeClass}`}>
                      {cat.label}
                    </span>
                    <span className="font-mono text-sm font-black text-slate-100">
                      {tested > 0 ? `${rate}%` : '---'}
                    </span>
                  </div>

                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${tested > 0 ? rate : 0}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span>Đúng: <strong className="text-emerald-400">{correct}</strong> / {tested} mẫu</span>
                    <span>Precision: <strong className="text-slate-200">{tested > 0 ? `${metric.precision}%` : '---'}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scientific Disclaimer Note */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200">Nguyên tắc đánh giá rác nguy hại:</strong> Đối với pin cũ, hóa chất, vật sắc nhọn, hệ thống ghi nhận vào nhóm <span className="text-rose-400 font-bold">Rác Nguy Hại / Thu Gom Riêng</span> và đánh giá độc lập, không cố tình ép vào 3 nhóm rác thông thường.
            </div>
          </div>
        </div>

        {/* Right (5 Cols): 6 Difficult Edge Cases Quick Test Summary */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-black text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Bộ 6 Mẫu Thử Thách & Dễ Nhầm Lẫn
            </h2>
            <span className="text-[11px] text-amber-400 font-mono">
              {stats.edgeCaseStats.correctCount} / {stats.edgeCaseStats.totalTested} đúng
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Các vật thể kiểm thử thách thức năng lực suy luận thực tế của AI (chất lỏng, dầu mỡ thấm, màng phức hợp, pin độc hại).
          </p>

          <div className="space-y-2">
            {stats.edgeCaseStats.items.map((item) => (
              <div
                key={item.type}
                className="flex items-center justify-between bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 rounded-xl px-3 py-2 text-xs transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="font-semibold text-slate-200">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  {item.tested > 0 ? (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.correct === item.tested ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'}`}>
                      {item.correct}/{item.tested} ({Math.round((item.correct / item.tested) * 100)}%)
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Chưa thử</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confusion Matrix (Ma Trận Nhầm Lẫn) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              Ma Trận Nhầm Lẫn (Confusion Matrix)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Đối soát hàng (Nhãn Chuẩn Thực Tế - Ground Truth) và cột (Kết Quả AI Dự Đoán) để phát hiện xu hướng nhầm lẫn.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Đường chéo: Dự đoán chính xác
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-bold">
                <th className="p-3 text-slate-300">Thực Tế (Ground Truth) \ Dự Đoán</th>
                <th className="p-3 text-emerald-400 text-center">Hữu Cơ</th>
                <th className="p-3 text-amber-400 text-center">Tái Chế</th>
                <th className="p-3 text-orange-400 text-center">Vô Cơ</th>
                <th className="p-3 text-rose-400 text-center">Nguy Hại</th>
                <th className="p-3 text-slate-400 text-center">Chưa Chắc Chắn</th>
                <th className="p-3 text-right text-slate-300">Tổng Thực</th>
                <th className="p-3 text-right text-cyan-400">Recall (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {stats.confusionMatrix.rowLabels.map((rowKey) => {
                const metric = stats.categories[rowKey];
                const matrixRow = stats.confusionMatrix.matrix[rowKey];
                return (
                  <tr key={rowKey} className="hover:bg-slate-850/40 transition-colors">
                    <td className="p-3 font-sans font-bold text-slate-200 flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            rowKey === 'organic'
                              ? '#10b981'
                              : rowKey === 'recyclable'
                              ? '#eab308'
                              : rowKey === 'inorganic'
                              ? '#f97316'
                              : '#ef4444',
                        }}
                      />
                      {metric.label}
                    </td>

                    {/* Predictions cells */}
                    {(['organic', 'recyclable', 'inorganic', 'special_hazardous', 'uncertain'] as BenchmarkCategory[]).map((colKey) => {
                      const count = matrixRow[colKey] || 0;
                      const isDiagonal = rowKey === colKey;

                      let cellStyle = 'text-slate-500 bg-transparent';
                      if (count > 0) {
                        if (isDiagonal) {
                          cellStyle = 'bg-emerald-950/80 text-emerald-300 font-black border border-emerald-500/50 shadow-inner';
                        } else if (colKey === 'uncertain') {
                          cellStyle = 'bg-slate-800 text-slate-200 font-bold';
                        } else {
                          cellStyle = 'bg-rose-950/70 text-rose-300 font-bold border border-rose-500/40';
                        }
                      }

                      return (
                        <td key={colKey} className="p-3 text-center">
                          <span className={`inline-block w-8 py-1 rounded text-xs ${cellStyle}`}>
                            {count}
                          </span>
                        </td>
                      );
                    })}

                    <td className="p-3 text-right text-slate-300 font-bold">
                      {metric.testedCount}
                    </td>
                    <td className="p-3 text-right text-cyan-300 font-bold">
                      {metric.testedCount > 0 ? `${metric.recall}%` : '---'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter Tabs & Batch Run Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === 'all'
                ? 'bg-slate-100 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Tất cả ({samples.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('tested')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === 'tested'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Đã chạy AI ({stats.actualTestedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('untested')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === 'untested'
                ? 'bg-cyan-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Chưa chạy ({samples.length - stats.actualTestedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('edge_cases')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === 'edge_cases'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Vật thể khó ({samples.filter((s) => s.isDifficultOrEdgeCase).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('organic')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === 'organic'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Hữu cơ ({samples.filter((s) => s.groundTruthCategory === 'organic').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('recyclable')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === 'recyclable'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Tái chế ({samples.filter((s) => s.groundTruthCategory === 'recyclable').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('inorganic')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === 'inorganic'
                ? 'bg-orange-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Vô cơ ({samples.filter((s) => s.groundTruthCategory === 'inorganic').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('special_hazardous')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === 'special_hazardous'
                ? 'bg-rose-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Nguy hại ({samples.filter((s) => s.groundTruthCategory === 'special_hazardous').length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {samples.length > 0 && (
            <button
              id="btn-batch-ai-run"
              type="button"
              disabled={isProcessingBatch}
              onClick={runBatchAiTest}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shadow-md ${
                isProcessingBatch
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 cursor-wait'
                  : 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white active:scale-95'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessingBatch ? 'animate-spin' : ''}`} />
              <span>
                {isProcessingBatch
                  ? `Đang chạy AI (${batchProgress?.current}/${batchProgress?.total})...`
                  : 'Chạy AI Mẫu Có Ảnh'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => exportBenchmarkToJson(samples)}
            title="Sao lưu dữ liệu kiểm thử dạng JSON"
            className="p-1.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/80 transition-all text-xs"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            title="Xóa danh sách kiểm thử"
            className="p-1.5 rounded-xl bg-slate-850 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700/80 transition-all text-xs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Test Samples Grid */}
      {filteredSamples.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <FlaskConical className="w-12 h-12 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-200">Chưa có mẫu kiểm thử nào trong bộ lọc này</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Không tự động điền kết quả giả lập. Hãy khởi tạo 30 khung mẫu chuẩn STEM và chụp ảnh thực tế để bắt đầu đánh giá độ chính xác AI.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleInitPresets}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md active:scale-95 transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Khởi Tạo 30 Khung Mẫu Chuẩn STEM</span>
            </button>
            <button
              type="button"
              onClick={openAddSampleModal}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Mẫu Mới</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSamples.map((sample) => {
            const isRunning = processingSampleId === sample.id;
            const isTested = sample.hasRunAI;
            const isMatch = isTested && sample.predictedCategory === sample.groundTruthCategory;
            const isUncertain = isTested && (sample.isUncertain || sample.predictedCategory === 'uncertain');

            // Ground truth badge
            const gtCat = BENCHMARK_CATEGORIES.find((c) => c.key === sample.groundTruthCategory);
            // Pred category badge
            const predCat = BENCHMARK_CATEGORIES.find((c) => c.key === sample.predictedCategory);

            return (
              <div
                key={sample.id}
                className={`bg-slate-900/90 border rounded-2xl p-4 flex flex-col justify-between transition-all shadow-md ${
                  isTested
                    ? isMatch
                      ? 'border-emerald-500/40 hover:border-emerald-400 shadow-emerald-950/20'
                      : isUncertain
                      ? 'border-amber-500/40 hover:border-amber-400 shadow-amber-950/20'
                      : 'border-rose-500/40 hover:border-rose-400 shadow-rose-950/20'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  {/* Top line: Code, Edge Case tag, Action buttons */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-md border border-cyan-500/30">
                        {sample.sampleCode}
                      </span>
                      {sample.isDifficultOrEdgeCase && (
                        <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-500/40">
                          Vật thể khó
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditSampleModal(sample)}
                        title="Chỉnh sửa mẫu"
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all text-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSample(sample.id)}
                        title="Xóa mẫu"
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 transition-all text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Item Name */}
                  <h3 className="text-sm font-bold text-slate-100 line-clamp-1" title={sample.itemName}>
                    {sample.itemName}
                  </h3>

                  {/* Image area */}
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center group">
                    {sample.image ? (
                      <>
                        <img
                          src={sample.image}
                          alt={sample.itemName}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openWebcamForSample(sample.id)}
                            className="p-2 rounded-xl bg-slate-900/90 hover:bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-xs flex items-center gap-1 font-bold shadow"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Chụp lại</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerUploadForSample(sample.id)}
                            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs flex items-center gap-1 font-bold shadow"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Đổi ảnh</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-3 space-y-2">
                        <Camera className="w-8 h-8 text-slate-600 mx-auto" />
                        <div className="text-[11px] text-slate-400">Chưa có ảnh vật thể thực</div>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openWebcamForSample(sample.id)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow"
                          >
                            <Camera className="w-3 h-3" />
                            <span>Chụp Camera</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerUploadForSample(sample.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] flex items-center gap-1 border border-slate-700"
                          >
                            <Upload className="w-3 h-3" />
                            <span>Tải tệp</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ground Truth & Prediction Comparison */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 space-y-2 text-xs">
                    {/* Ground truth line */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-emerald-400" />
                        Nhãn Chuẩn (Ground Truth):
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${gtCat?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                        {gtCat?.label || sample.groundTruthCategory}
                      </span>
                    </div>

                    {/* AI Prediction line */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-850">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        AI Dự Đoán:
                      </span>
                      {isTested ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${predCat?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                            {predCat?.label || (sample.isUncertain ? 'Chưa chắc chắn' : sample.predictedCategory)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Chưa chạy kiểm thử</span>
                      )}
                    </div>

                    {/* Match evaluation status badge */}
                    {isTested && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-850 font-mono">
                        <div className="flex items-center gap-1">
                          {isMatch ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-black font-sans">
                              <Check className="w-3 h-3" />
                              ĐÚNG
                            </span>
                          ) : isUncertain ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-black font-sans">
                              <AlertTriangle className="w-3 h-3" />
                              CHƯA CHẮC CHẮN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-500/40 text-[10px] font-black font-sans">
                              <X className="w-3 h-3" />
                              SAI
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-cyan-300 font-bold" title="Độ tin cậy của mô hình AI">
                          Tin cậy: {Math.round((sample.aiConfidence || 0) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* AI Handling Proposal & Evaluator Grading */}
                  {isTested && (
                    <div className="space-y-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80">
                      <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                        <span>Hướng xử lý AI đề xuất:</span>
                        {sample.hasLiquid && (
                          <span className="text-[10px] text-amber-400 bg-amber-950 px-1.5 py-0.2 rounded border border-amber-500/30">
                            Phát hiện nước
                          </span>
                        )}
                      </div>

                      {/* Display steps */}
                      {sample.aiRecommendedSteps && sample.aiRecommendedSteps.length > 0 ? (
                        <div className="space-y-1">
                          {sample.aiRecommendedSteps.map((st, i) => (
                            <div key={st.id || i} className="text-[11px] text-slate-300 flex items-start gap-1">
                              <span className="font-bold text-cyan-400 shrink-0">{i + 1}.</span>
                              <span className="leading-tight">{st.instruction}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 line-clamp-2">
                          {sample.aiHandlingSummary || 'Phân loại đúng thùng rác quy chuẩn.'}
                        </p>
                      )}

                      {/* Evaluator suitability review buttons */}
                      <div className="pt-2 border-t border-slate-850 space-y-1.5">
                        <div className="text-[10px] text-slate-400 font-semibold">
                          Thẩm định hướng xử lý (Giáo viên / Giám khảo):
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => updateHandlingReview(sample.id, 'suitable')}
                            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                              sample.handlingSuitability === 'suitable'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-400 ring-1 ring-emerald-400/40 shadow-sm'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-emerald-400'
                            }`}
                          >
                            Phù hợp
                          </button>
                          <button
                            type="button"
                            onClick={() => updateHandlingReview(sample.id, 'needs_adjustment')}
                            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                              sample.handlingSuitability === 'needs_adjustment'
                                ? 'bg-amber-950 text-amber-300 border-amber-400 ring-1 ring-amber-400/40 shadow-sm'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-amber-400'
                            }`}
                          >
                            Cần chỉnh
                          </button>
                          <button
                            type="button"
                            onClick={() => updateHandlingReview(sample.id, 'unsuitable')}
                            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                              sample.handlingSuitability === 'unsuitable'
                                ? 'bg-rose-950 text-rose-300 border-rose-400 ring-1 ring-rose-400/40 shadow-sm'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-rose-400'
                            }`}
                          >
                            Chưa hợp
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Card Actions */}
                <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500 font-mono">
                    {sample.evaluatedAt ? new Date(sample.evaluatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Chưa test'}
                  </span>

                  <button
                    type="button"
                    disabled={isRunning || !sample.image}
                    onClick={() => runAiTestForSample(sample.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow ${
                      isRunning
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 cursor-wait'
                        : !sample.image
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 active:scale-95'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                    <span>{isRunning ? 'Đang phân tích...' : isTested ? 'Chạy lại AI' : 'Chạy kiểm thử AI'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: ADD / EDIT SAMPLE MODAL (With Ground-truth First Blind Mode) */}
      {/* ===================================================================== */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">
                  {editingSample ? 'Chỉnh Sửa Mẫu Kiểm Thử' : 'Thêm Mẫu Kiểm Thử Mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddEditModalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSample} className="space-y-4 text-xs">
              {/* Quick prefill for difficult edge cases */}
              {!editingSample && (
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Điền nhanh mẫu vật thể khó chuẩn STEM:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {EDGE_CASE_PRESETS.map((p) => (
                      <button
                        key={p.type}
                        type="button"
                        onClick={() => applyEdgeCaseTemplate(p.type)}
                        className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 hover:border-amber-400 transition-all"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Code & Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mã mẫu:</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="TST-001"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Tên vật thể thực tế:</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ví dụ: Hộp pizza dính dầu mỡ"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Ground Truth Category (Xác nhận nhãn chuẩn) */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  Nhóm rác đúng (Ground Truth do giám khảo xác nhận):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {BENCHMARK_CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setFormCategory(cat.key)}
                      className={`py-2 px-3 rounded-xl font-bold border text-left transition-all ${
                        formCategory === cat.key
                          ? `border-cyan-400 ring-2 ring-cyan-400/40 shadow-sm ${cat.badgeClass}`
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Edge Case flag */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-is-edge-case"
                  checked={formIsEdgeCase}
                  onChange={(e) => setFormIsEdgeCase(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4 bg-slate-950 border-slate-800"
                />
                <label htmlFor="chk-is-edge-case" className="text-slate-300 font-medium">
                  Đánh dấu là vật thể khó / tình huống ngoại lệ (chất lỏng, dầu mỡ, nhiều lớp)
                </label>
              </div>

              {/* Ground Truth Notes */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Ghi chú cơ sở khoa học của nhãn chuẩn:
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ví dụ: Giấy dính dầu mỡ làm hỏng mẻ nghiền bột giấy tái chế -> bắt buộc bỏ rác vô cơ."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* Anti-Bias Lock Guarantee */}
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-start gap-2">
                <Lock className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <strong className="text-emerald-200">Quy tắc mù đôi (Blind Evaluation):</strong> Nhãn chuẩn được giám khảo xác lập độc lập trước khi chạy AI để ngăn ngừa hoàn toàn thiên lệch phán đoán (confirmation bias).
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-slate-950 font-bold bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 shadow-md active:scale-95 transition-all"
                >
                  {editingSample ? 'Lưu Thay Đổi' : 'Xác Nhận & Tạo Mẫu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: WEBCAM SNAPSHOT MODAL */}
      {/* ===================================================================== */}
      {isWebcamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Chụp Ảnh Mẫu Thử Nghiệm Từ Camera
                </h3>
              </div>
              <button
                type="button"
                onClick={closeWebcam}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {webcamError ? (
              <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs space-y-2">
                <p className="font-bold">{webcamError}</p>
                <p className="text-slate-400">Bạn có thể dùng nút tải ảnh tệp từ máy tính/điện thoại.</p>
              </div>
            ) : (
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* STEM camera crosshair overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-3/4 h-3/4 border-2 border-dashed border-cyan-400/60 rounded-2xl flex items-center justify-center">
                    <span className="text-[11px] font-bold text-cyan-300 bg-slate-950/80 px-2 py-0.5 rounded-md">
                      Đặt vật thể mẫu vào giữa khung
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={closeWebcam}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200"
              >
                Đóng
              </button>

              {!webcamError && (
                <button
                  type="button"
                  onClick={captureWebcamPhoto}
                  className="px-6 py-2.5 rounded-xl text-xs font-black text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 shadow-lg active:scale-95 transition-all flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Chụp Ảnh Mẫu</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: STEM TESTING PROTOCOL & REPORTING GUIDE */}
      {/* ===================================================================== */}
      {isProtocolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Quy Trình Kiểm Thử Độ Chính Xác AI Đạt Chuẩn Khoa Học STEM
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsProtocolModalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200">
                <strong className="text-cyan-100">Mục đích phương pháp luận:</strong> Đo lường độ chính xác thực tế của hệ sinh thái AI SmartWaste trên tập dữ liệu kiểm nghiệm mới hoàn toàn (chưa từng xuất hiện trong quá trình huấn luyện/tinh chỉnh), đảm bảo tính minh bạch, khách quan và có thể lặp lại (reproducible) trước Hội đồng Giám khảo STEM.
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
                    1
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">Thu thập 30 mẫu vật thể thực tế</h4>
                    <p className="text-slate-400 mt-0.5">
                      Phân bổ chuẩn: 10 mẫu Hữu cơ, 10 mẫu Tái chế, 10 mẫu Vô cơ & Nguy hại. Bắt buộc có các mẫu vật thể khó như hộp sữa giấy Tetra Pak, ly trà sữa còn nước, giấy dính dầu mỡ, pin cũ.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
                    2
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">Xác nhận nhãn chuẩn (Ground Truth) trước khi chạy AI</h4>
                    <p className="text-slate-400 mt-0.5">
                      Giáo viên/thí sinh ghi nhận phân loại chuẩn dựa trên thành phần chất liệu vật thể thực. Khóa nhãn trước khi đưa vào camera để tuân thủ nguyên tắc kiểm thử mù đôi, loại bỏ thiên lệch chủ quan.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
                    3
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">Chụp ảnh và chạy suy luận AI trên máy chủ thật</h4>
                    <p className="text-slate-400 mt-0.5">
                      Chụp ảnh vật thể dưới ánh sáng tự nhiên. Nhấn "Chạy kiểm thử AI". Hệ thống kích hoạt mô hình Gemini Vision máy chủ phân tích độc lập (không cấp điểm thi đua, không ghi nhận vào lịch sử học sinh).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
                    4
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">Thẩm định hướng xử lý đề xuất</h4>
                    <p className="text-slate-400 mt-0.5">
                      Đánh giá xem các bước AI hướng dẫn (như đổ cạn nước, ép dẹp, gom riêng pin) có phù hợp với thực tiễn bảo vệ môi trường trường học hay không.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">
                    5
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-sm">Phân tích ma trận nhầm lẫn & Xuất báo cáo CSV</h4>
                    <p className="text-slate-400 mt-0.5">
                      Quan sát ma trận nhầm lẫn để trình bày trực quan trước Ban Giám khảo. Nhấn "Xuất Báo Cáo CSV" để tải bảng dữ liệu nghiệm thu nộp kèm tập san dự án STEM.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 text-[11px] text-slate-400">
                <strong className="text-slate-200">Gợi ý trả lời Ban Giám Khảo:</strong> Khi giám khảo hỏi về tỷ lệ chính xác, nhóm báo cáo dựa trên <span className="text-emerald-400 font-bold">Độ chính xác thực nghiệm ({stats.empiricalAccuracyRate}%)</span> được chứng minh bằng 30 mẫu vật thể thật, tách bạch rõ ràng với số điểm thi đua và không dùng dữ liệu mô phỏng.
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsProtocolModalOpen(false)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow transition-all"
              >
                Đã Hiểu Quy Trình
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: EVALUATOR / TEACHER AUTHENTICATION MODAL */}
      {/* ===================================================================== */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Xác Thực Quyền Giám Khảo STEM Lab
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Chế độ kiểm thử STEM Lab phục vụ hội đồng chấm thi và giáo viên hướng dẫn. Backend yêu cầu xác thực phiên làm việc để đảm bảo học sinh không thể kích hoạt cờ kiểm thử nhằm vượt hạn mức hay bỏ qua chống gian lận.
            </p>

            <form onSubmit={handleEvaluatorAuth} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Mã Bí Mật Giám Khảo / Admin Secret Key:
                </label>
                <input
                  type="password"
                  value={authPasskeyInput}
                  onChange={(e) => setAuthPasskeyInput(e.target.value)}
                  placeholder="Nhập mã xác thực ban tổ chức..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  autoFocus
                />
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAuth || !authPasskeyInput.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isSubmittingAuth ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  <span>Xác Nhận Quyền Giám Khảo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
