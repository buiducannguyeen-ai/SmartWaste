import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  Zap,
  Sparkles,
  AlertCircle,
  ScanLine,
  Sliders,
  CheckCircle,
  Eye,
  SwitchCamera,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  HelpCircle,
  Clock,
  Database,
  Lock,
  Video,
  VideoOff,
  CameraOff,
  Upload,
} from 'lucide-react';
import {
  WasteClassificationResult,
  WasteCategory,
  DuplicateAlertInfo,
  ScannedFingerprintRecord,
  PreparationStep,
  PreparationStepStatus,
} from '../types';
import { playScanSound, playPointSound, playWarningSound, playClickSound, playVictorySound } from '../utils/audio';
import {
  computeImageFingerprint,
  evaluateAgainstRegistry,
  calculateHashSimilarity,
  loadFingerprintRegistry,
  registerScannedFingerprint,
  clearFingerprintRegistry,
  computeFastChecksum,
  fetchServerFingerprintRegistry,
  FingerprintResult,
} from '../utils/imageFingerprint';
import { DEMO_WASTE_ITEMS } from '../data/demoItems';
import { AntiCheatAuditModal } from './AntiCheatAuditModal';
import { PreparationChecklistModal } from './PreparationChecklistModal';
import { getSessionToken } from '../lib/authApi';

interface WebcamScannerProps {
  onClassified: (result: WasteClassificationResult) => void;
  onConfirmAwardPoints?: (
    result: WasteClassificationResult
  ) => Promise<{ success: boolean; error?: string; alreadyProcessed?: boolean; pointsAwarded?: number }>;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  onDuplicateDetected?: (alert: DuplicateAlertInfo) => void;
  onOpenGuide?: () => void;
}

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onClassified,
  onConfirmAwardPoints,
  isProcessing,
  setIsProcessing,
  onDuplicateDetected,
  onOpenGuide,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Scan HUD visual states
  const [lastScannedImage, setLastScannedImage] = useState<string | null>(null);
  const [scanStatusText, setScanStatusText] = useState('CHỜ KÍCH HOẠT CAMERA');
  const [scanErrorMessage, setScanErrorMessage] = useState<string | null>(null);

  // Rescan Verification State (Nghiệm thu chai rỗng trước khi cộng 2 điểm tái chế)
  const [rescanVerificationTarget, setRescanVerificationTarget] = useState<WasteClassificationResult | null>(null);

  // Anti-Cheat & Duplicate Prevention State (Khóa chống gian lận luôn kích hoạt cố định theo quy chế STEM)
  const antiCheatEnabled = true;
  const [fingerprintRegistry, setFingerprintRegistry] = useState<ScannedFingerprintRecord[]>(() =>
    loadFingerprintRegistry()
  );
  const [isRegistryModalOpen, setIsRegistryModalOpen] = useState(false);
  const [previousFingerprint, setPreviousFingerprint] = useState<FingerprintResult | null>(null);
  const [previousItemName, setPreviousItemName] = useState<string | null>(null);
  const [lastDemoItemId, setLastDemoItemId] = useState<string | null>(null);
  const [lastDemoScanTime, setLastDemoScanTime] = useState<number>(0);
  const [waitingForBinDeposit, setWaitingForBinDeposit] = useState(false);
  const [activePreparationItem, setActivePreparationItem] = useState<WasteClassificationResult | null>(null);
  const [activePreparationSteps, setActivePreparationSteps] = useState<PreparationStep[]>([]);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [isSubmittingPoints, setIsSubmittingPoints] = useState(false);
  const [pointsSubmissionError, setPointsSubmissionError] = useState<string | null>(null);
  const [pointsSubmissionSuccess, setPointsSubmissionSuccess] = useState<string | null>(null);
  const [lastSimilarity, setLastSimilarity] = useState<number>(0);
  const [duplicateBlockedCount, setDuplicateBlockedCount] = useState(0);

  // Daily Scan Quota: Server-authoritative (Single Source of Truth from /api/quota/status)
  const [remainingQuota, setRemainingQuota] = useState<number>(30);
  const [quotaLimit, setQuotaLimit] = useState<number>(30);

  // Sync quota from server on mount and when active user changes
  const refreshQuota = useCallback(async () => {
    try {
      const token = getSessionToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/quota/status', { headers });
      const data = await res.json().catch(() => null);
      if (data && typeof data.remaining === 'number') {
        setRemainingQuota(data.remaining);
        if (typeof data.limit === 'number') setQuotaLimit(data.limit);
      }
    } catch (e) {
      console.warn('Notice syncing quota from server:', e);
    }
  }, []);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  // Sync master fingerprint registry from central backend on mount
  useEffect(() => {
    fetchServerFingerprintRegistry()
      .then((serverReg) => {
        if (serverReg && serverReg.length > 0) {
          setFingerprintRegistry(serverReg);
        }
      })
      .catch((err) => {
        console.warn('Could not sync server fingerprint registry:', err);
      });
  }, []);

  // Stop video stream & turn off webcam hardware
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsStartingCamera(false);
    setScanStatusText('CAMERA ĐÃ TẮT - BẤM ĐỂ BẬT LẠI');
  }, []);

  // Start video stream only when explicitly triggered by user
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsStartingCamera(true);
    setScanStatusText('ĐANG KẾT NỐI WEBCAM...');
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Trình duyệt không hỗ trợ WebRTC Camera.');
      }

      // Check available devices
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      } catch (e) {}

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
        };
      }
      setCameraActive(true);
      setIsStartingCamera(false);
      setScanStatusText('CAMERA TRỰC TIẾP SẴN SÀNG');
    } catch (err: any) {
      console.warn('Camera access denied or failed:', err);
      setCameraActive(false);
      setIsStartingCamera(false);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Quyền truy cập camera bị từ chối trong trình duyệt. Vui lòng cho phép quyền Camera trên thanh địa chỉ để quét trực tiếp.'
          : 'Không thể kết nối webcam. Vui lòng kiểm tra thiết bị hoặc sử dụng chế độ tải ảnh / mô phỏng.'
      );
      setScanStatusText('CHƯA CẤP QUYỀN CAMERA');
    }
  }, [facingMode]);

  // Clean up stream on unmount ONLY - do not auto-start camera on page enter
  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // When facingMode changes, if camera was already running, switch it
  useEffect(() => {
    if (cameraActive) {
      startCamera();
    }
  }, [facingMode]);

  // Flip camera
  const handleFlipCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Capture frame from video to base64 (optimized resolution for fast Gemini vision)
  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    // Rescale to max 960px to drastically speed up network transfer & Gemini inference
    let w = video.videoWidth;
    let h = video.videoHeight;
    const maxDim = 960;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  };

  // Update preparation checklist step status
  const handleUpdateStepStatus = (stepId: string, newStatus: PreparationStepStatus) => {
    setActivePreparationSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status: newStatus } : s))
    );
  };

  // Complete preparation steps and award points (triggered strictly when student clicks "Tôi đã xử lý và bỏ rác đúng cách")
  const handleConfirmCompletePreparation = async () => {
    if (!activePreparationItem || isSubmittingPoints) return;

    if (activePreparationItem.requiresRescanEmpty && !activePreparationItem.rescanVerified) {
      setPointsSubmissionError(
        'Chai nhựa vẫn còn chất lỏng. Bạn bắt buộc phải quét lại camera sau khi đã trút sạch nước để nghiệm thu và mở khóa điểm!'
      );
      return;
    }

    const scanId =
      activePreparationItem.scanId ||
      'scan-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    const finalResult: WasteClassificationResult = {
      ...activePreparationItem,
      scanId,
      preparationSteps: activePreparationSteps,
      flowState: 'user_confirmed',
    };

    setIsSubmittingPoints(true);
    setPointsSubmissionError(null);
    setPointsSubmissionSuccess(null);

    try {
      if (onConfirmAwardPoints) {
        const res = await onConfirmAwardPoints(finalResult);
        if (res.success) {
          const awarded = res.pointsAwarded ?? finalResult.points;
          setPointsSubmissionSuccess(
            `Chúc mừng bạn đã xử lý và phân loại rác đúng cách! Đã cộng +${awarded} điểm vào tài khoản.`
          );
          setPreviousItemName(finalResult.itemName);
          setScanStatusText(
            `ĐÃ XÁC NHẬN & CỘNG ĐIỂM: ${finalResult.itemName.toUpperCase()} (+${awarded} Đ)`
          );
          setTimeout(() => {
            setIsChecklistOpen(false);
            setActivePreparationItem(null);
            setActivePreparationSteps([]);
            setIsSubmittingPoints(false);
            setPointsSubmissionSuccess(null);
            setWaitingForBinDeposit(true);
          }, 1500);
        } else {
          setIsSubmittingPoints(false);
          setPointsSubmissionError(
            res.error || 'Máy chủ không thể lưu điểm. Vui lòng bấm Thử lại để ghi nhận điểm an toàn.'
          );
        }
      } else {
        // Direct callback fallback
        onClassified(finalResult);
        setIsChecklistOpen(false);
        setActivePreparationItem(null);
        setActivePreparationSteps([]);
        setIsSubmittingPoints(false);
        setWaitingForBinDeposit(true);
      }
    } catch (err: any) {
      setIsSubmittingPoints(false);
      setPointsSubmissionError(
        err?.message || 'Lỗi mạng khi lưu điểm. Vui lòng kiểm tra kết nối và bấm Thử lại.'
      );
    }
  };

  // Cancel preparation process (STRICTLY NO POINTS AWARDED)
  const handleCancelPreparation = () => {
    setIsChecklistOpen(false);
    setActivePreparationItem(null);
    setActivePreparationSteps([]);
    setRescanVerificationTarget(null);
    setIsSubmittingPoints(false);
    setPointsSubmissionError(null);
    setPointsSubmissionSuccess(null);
    setScanStatusText('ĐÃ HỦY: SẴN SÀNG QUÉT MẪU MỚI (+0 ĐIỂM)');
  };

  // Start rescan verification for bottles/cups that had liquid
  const handleStartRescan = (item: WasteClassificationResult) => {
    setIsChecklistOpen(false);
    setRescanVerificationTarget(item);
    setScanErrorMessage(null);
    if (!cameraActive) {
      startCamera();
    }
    setScanStatusText(`📷 ĐƯA CHAI ĐÃ RỖNG VÀO CAMERA ĐỂ NGHIỆM THU (+2 Đ)`);
  };

  // Confirm student self-declaration of proper disposal into designated bin
  const handleConfirmBinDrop = () => {
    setWaitingForBinDeposit(false);
    setActivePreparationItem(null);
    setActivePreparationSteps([]);
    setRescanVerificationTarget(null);
    setPreviousFingerprint(null);
    setLastDemoItemId(null);
    setLastSimilarity(0);
    setScanStatusText('HỌC SINH ĐÃ XÁC NHẬN: ĐÃ XỬ LÝ & BỎ RÁC ĐÚNG THÙNG');
  };

  // Perform AI Classification on an image base64
  const handleProcessImage = async (
    base64Image: string,
    hint?: string,
    scanSource: 'webcam' | 'file_upload' = 'webcam',
    verificationTarget: WasteClassificationResult | null = rescanVerificationTarget
  ) => {
    if (isProcessing) return;

    const isVerifying = Boolean(verificationTarget);

    // 1. Anti-cheat duplicate evaluation against the ENTIRE registry of scanned fingerprints
    // Note: Bypassed when performing rescan verification on the same bottle after pouring water!
    let currentFingerprint: FingerprintResult | null = null;
    if (antiCheatEnabled && !isVerifying) {
      currentFingerprint = await computeImageFingerprint(base64Image);

      const duplicateCheck = evaluateAgainstRegistry(
        currentFingerprint,
        fingerprintRegistry
      );

      const simPercent = Math.round(duplicateCheck.similarity * 100);
      setLastSimilarity(simPercent);

      if (duplicateCheck.isDuplicate) {
        playWarningSound();
        setDuplicateBlockedCount((prev) => prev + 1);
        const alertInfo: DuplicateAlertInfo = {
          itemName: duplicateCheck.matchedRecord?.itemName || previousItemName || 'Món rác',
          similarity: duplicateCheck.similarity,
          timeSinceLastScanMs: duplicateCheck.timeSinceLastScanMs,
          reason: duplicateCheck.reason,
          suggestedAction: duplicateCheck.suggestedAction,
          matchedRecord: duplicateCheck.matchedRecord
            ? {
                id: duplicateCheck.matchedRecord.id,
                itemName: duplicateCheck.matchedRecord.itemName,
                timestamp: duplicateCheck.matchedRecord.timestamp,
                thumbnail: duplicateCheck.matchedRecord.thumbnail,
                userName: duplicateCheck.matchedRecord.userName,
                fingerprintHash: duplicateCheck.matchedRecord.dHash,
              }
            : undefined,
          currentThumbnail: currentFingerprint.thumbnail,
          isExactFileMatch: duplicateCheck.isExactFileMatch,
          isScreenSpoof: duplicateCheck.isScreenSpoof,
          detectionTier: duplicateCheck.detectionTier,
          technicalDetails: duplicateCheck.technicalDetails,
        };
        if (onDuplicateDetected) {
          onDuplicateDetected(alertInfo);
        }

        let statusMsg = `⚠️ GIAN LẬN: TRÙNG MẪU ${simPercent}% (+0 ĐIỂM)`;
        if (duplicateCheck.detectionTier === 'screen_spoof' || duplicateCheck.isScreenSpoof) {
          statusMsg = '🚫 GIAN LẬN: PHÁT HIỆN ẢNH MÀN HÌNH (+0 ĐIỂM)';
        } else if (duplicateCheck.detectionTier === 'exact_file' || duplicateCheck.isExactFileMatch) {
          statusMsg = '🚫 GIAN LẬN: TỆP ẢNH ĐÃ TỪNG DÙNG (100% TRÙNG LẶP)';
        } else if (duplicateCheck.detectionTier === 'modified_image') {
          statusMsg = `⚠️ GIAN LẬN: ẢNH ĐÃ QUA CHỈNH SỬA / CẮT CÚP ${simPercent}% (+0 ĐIỂM)`;
        } else if (duplicateCheck.detectionTier === 'same_physical_object') {
          statusMsg = `⚠️ TRÙNG VẬT THỂ: ĐÃ QUÉT TRƯỚC ĐÓ (+0 ĐIỂM)`;
        }
        setScanStatusText(statusMsg);
        return;
      }
    }

    setIsProcessing(true);
    setScanStatusText(
      isVerifying ? 'AI ĐANG GIÁM ĐỊNH CHAI RỖNG...' : 'ĐANG PHÂN TÍCH VẬT THỂ AI...'
    );
    setScanErrorMessage(null);
    playScanSound();
    setLastScannedImage(base64Image);

    // Unique idempotency key to prevent double quota deduction on network retry
    const idempotencyKey = 'scan_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const sessionToken = getSessionToken();

    try {
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-idempotency-key': idempotencyKey,
      };
      if (sessionToken) {
        reqHeaders['Authorization'] = `Bearer ${sessionToken}`;
      }

      const response = await fetch('/api/classify-waste', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          image: base64Image,
          hint,
          isRescanVerification: isVerifying,
          previousScanId: verificationTarget?.scanId,
          originalItemName: verificationTarget?.itemName,
          idempotencyKey,
          fingerprint: currentFingerprint ? {
            checksum: currentFingerprint.checksum,
            dHash: currentFingerprint.dHash,
            aHash: currentFingerprint.aHash,
            centerDHash: currentFingerprint.centerDHash,
            quadrantHashes: currentFingerprint.quadrantHashes,
            colorBins: currentFingerprint.colorHistogram.bins,
            screenSpoofScore: currentFingerprint.screenSpoof.score,
            isScreenSpoofRisk: currentFingerprint.screenSpoof.isScreenSpoofRisk,
            timestamp: currentFingerprint.timestamp,
          } : undefined,
        }),
      });

      const result = await response.json().catch(() => null);

      // Synchronize server-authoritative remaining quota if provided
      if (result?.quota && typeof result.quota.remaining === 'number') {
        setRemainingQuota(result.quota.remaining);
      }

      if (response.status === 429) {
        playWarningSound();
        setRemainingQuota(0);
        setScanStatusText('HẾT HẠN MỨC QUÉT HÔM NAY (30/30)');
        setScanErrorMessage(
          result?.error ||
          'Bạn đã dùng hết hạn mức 30 lượt quét AI hôm nay. Hạn mức sẽ tự động được làm mới vào lúc 00:00 (giờ Việt Nam).'
        );
        return;
      }

      if (!response.ok || !result) {
        playWarningSound();
        const errDesc =
          result?.error ||
          `Máy chủ nhận diện phản hồi lỗi (${response.status}). Vui lòng đưa mẫu rác rõ nét vào khung quét và thử lại.`;
        setScanStatusText('LỖI NHẬN DIỆN - KHÔNG CỘNG ĐIỂM');
        setScanErrorMessage(errDesc);
        return;
      }

      // Check Verification result if in Rescan Verification Mode
      if (isVerifying) {
        if (result.data?.rescanVerified) {
          playVictorySound();
          setRescanVerificationTarget(null);
          setScanErrorMessage(null);

          const verifiedItem: WasteClassificationResult = {
            ...(verificationTarget as WasteClassificationResult),
            ...result.data,
            points: 2,
            category: 'recyclable',
            hasLiquid: false,
            requiresRescanEmpty: false,
            rescanVerified: true,
            rawImage: base64Image,
            flowState: 'ai_recognized',
          };

          setActivePreparationItem(verifiedItem);
          setActivePreparationSteps([
            {
              id: 'step-1',
              instruction: 'Đã trút rỗng nước đạt chuẩn sạch (+2 Đ)',
              reason: 'Chai nhựa sạch rỗng đạt chuẩn nguyên liệu tái sinh bảo vệ môi trường',
              status: 'completed',
            },
          ]);
          setIsChecklistOpen(true);
          setScanStatusText('🎉 ĐÃ XÁC MINH CHAI RỖNG HOÀN TOÀN: MỞ KHÓA +2 ĐIỂM TÁI CHẾ!');
          return;
        } else {
          playWarningSound();
          const failMsg =
            result.data?.verificationMessage ||
            'Phát hiện trong chai vẫn còn nước hoặc chất lỏng bên trong. Vui lòng dốc sạch nước vào bồn rửa và bấm quét lại nghiệm thu!';
          setScanErrorMessage(failMsg);
          setScanStatusText('⚠️ CHAI VẪN CÒN NƯỚC: CHƯA ĐẠT TIÊU CHUẨN (+0 Đ)');
          return;
        }
      }

      // 0. Anti-Cheat: Check if server detected duplicate or screen spoof across devices
      if (result.isDuplicate || result.duplicateCheck?.isDuplicate) {
        playWarningSound();
        setDuplicateBlockedCount((prev) => prev + 1);
        const dup = result.duplicateCheck;
        const alertInfo: DuplicateAlertInfo = {
          itemName: dup?.matchedRecord?.itemName || result.data?.itemName || 'Vật thể trùng lặp',
          similarity: dup?.similarity || 0.95,
          timeSinceLastScanMs: dup?.timeSinceLastScanMs || 0,
          reason: dup?.reason || result.error || 'Phát hiện trùng lặp dữ liệu ảnh trên máy chủ.',
          suggestedAction: dup?.suggestedAction || 'Mỗi món rác chỉ được tích điểm 1 lần duy nhất! Hãy quét món rác mới.',
          matchedRecord: dup?.matchedRecord,
          currentThumbnail: currentFingerprint?.thumbnail,
          isExactFileMatch: dup?.isExactFileMatch,
          isScreenSpoof: dup?.isScreenSpoof,
          detectionTier: dup?.detectionTier,
          technicalDetails: dup?.technicalDetails,
        };
        if (onDuplicateDetected) {
          onDuplicateDetected(alertInfo);
        }
        setScanStatusText('⚠️ PHÁT HIỆN TRÙNG LẶP TRÊN MÁY CHỦ (+0 ĐIỂM)');
        setScanErrorMessage(alertInfo.reason);
        return;
      }

      // 1. Anti-Cheat: Check if AI detected screen or 2D photo spoofing
      if (result.isSpoof || result.data?.isScreenOrPhotoSpoof) {
        playWarningSound();
        setDuplicateBlockedCount((prev) => prev + 1);
        const alertInfo: DuplicateAlertInfo = {
          itemName: result.data?.itemName || 'Màn hình thiết bị',
          similarity: 1.0,
          timeSinceLastScanMs: 0,
          reason:
            result.data?.spoofReason ||
            result.error ||
            'Phát hiện bạn đang giơ một màn hình điện thoại hoặc bức ảnh 2D lên trước camera để gian lận tích điểm!',
          suggestedAction:
            'Yêu cầu đưa mẫu rác thật ngoài đời vào quét, nghiêm cấm quét ảnh chụp màn hình!',
          currentThumbnail: currentFingerprint?.thumbnail,
          isScreenSpoof: true,
        };
        if (onDuplicateDetected) {
          onDuplicateDetected(alertInfo);
        }
        setScanStatusText('🚫 PHÁT HIỆN ẢNH MÀN HÌNH (+0 Đ)');
        setScanErrorMessage(alertInfo.reason);
        return;
      }

      // 2. Check if AI is uncertain about the object or category
      if (result.isUncertain || result.data?.isUncertain) {
        playWarningSound();
        const fallbackItemName = result.data?.itemName || 'Vật thể chưa xác định';
        const rawCategory = result.data?.category;
        const validCategory = ['organic', 'recyclable', 'inorganic'].includes(rawCategory)
          ? rawCategory
          : 'inorganic';

        const uncertainResult: WasteClassificationResult = {
          category: validCategory as any,
          itemName: fallbackItemName,
          points: 0, // CRITICAL: NEVER award points for uncertain cases
          confidence: typeof result.data?.confidence === 'number' ? result.data.confidence : 0.45,
          description:
            result.data?.description ||
            'AI chưa chắc chắn về vật thể này. Vui lòng chụp lại ở nơi đủ ánh sáng hoặc chọn báo cáo AI nhận nhầm.',
          binColor: 'orange',
          recyclingTip:
            result.data?.recyclingTip ||
            'Vui lòng chụp lại ở nơi đủ ánh sáng hoặc chọn báo cáo AI nhận nhầm.',
          rawImage: base64Image,
          source: scanSource,
          isUncertain: true,
          uncertaintyReason:
            result.data?.uncertaintyReason ||
            'AI chưa chắc chắn về vật thể này. Vui lòng chụp lại ở nơi đủ ánh sáng hoặc chọn báo cáo AI nhận nhầm.',
        };

        setScanErrorMessage(null);
        setScanStatusText('⚠️ AI CHƯA CHẮC CHẮN (+0 ĐIỂM)');
        onClassified(uncertainResult);
        return;
      }

      // 3. Reject non-waste images (selfie, face, pet, clean room, etc.)
      if (
        result.isNotWaste ||
        result.data?.isWaste === false ||
        (result.data?.points === 0 && !result.data?.isUncertain && !result.data?.requiresRescanEmpty)
      ) {
        playWarningSound();
        const msg =
          result.error ||
          result.data?.rejectionReason ||
          'Không phát hiện vật thể rác thải hợp lệ trong hình ảnh. Không cộng điểm.';
        setScanStatusText('⚠️ KHÔNG PHẢI RÁC THẢI (+0 ĐIỂM)');
        setScanErrorMessage(msg);
        return;
      }

      // 3. Valid waste successfully recognized by AI
      if (result.success && result.data && ['organic', 'recyclable', 'inorganic'].includes(result.data.category)) {
        setScanErrorMessage(null);
        const scanId =
          result.data.scanId ||
          'scan-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

        const classified: WasteClassificationResult = {
          ...result.data,
          scanId,
          flowState: 'ai_recognized',
          rawImage: base64Image,
          fingerprintHash: currentFingerprint?.dHash,
          source: scanSource,
          isReferenceOnly: false,
        };

        // Save new fingerprint to lifetime registry
        if (currentFingerprint) {
          const newRecord: ScannedFingerprintRecord = {
            id: 'fp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            dHash: currentFingerprint.dHash,
            aHash: currentFingerprint.aHash,
            centerDHash: currentFingerprint.centerDHash,
            quadrantHashes: currentFingerprint.quadrantHashes,
            colorBins: currentFingerprint.colorHistogram.bins,
            checksum: currentFingerprint.checksum,
            timestamp: Date.now(),
            itemName: classified.itemName,
            category: classified.category,
            points: classified.points,
            thumbnail: currentFingerprint.thumbnail,
            screenSpoofScore: currentFingerprint.screenSpoof.score,
          };
          registerScannedFingerprint(newRecord);
          setFingerprintRegistry(loadFingerprintRegistry());
          setPreviousFingerprint(currentFingerprint);
          classified.fingerprintRecord = newRecord;
        }
        let steps: PreparationStep[] = (classified.preparationSteps || []).map((s: any, idx: number) => ({
          id: s.id || `step-${idx + 1}`,
          instruction: s.instruction,
          reason: s.reason,
          isSafetyWarning: s.isSafetyWarning,
          status: 'pending' as const,
        }));

        // Fallback default step if none provided
        if (steps.length === 0) {
          if (classified.category === 'organic') {
            steps = [
              {
                id: 'step-1',
                instruction: 'Bỏ trực tiếp vào thùng rác hữu cơ xanh lá',
                reason: 'Ủ thành phân compost vi sinh cho cây trồng',
                status: 'pending',
              },
            ];
          } else if (classified.category === 'recyclable') {
            steps = [
              {
                id: 'step-1',
                instruction: 'Kiểm tra làm sạch sơ và bỏ vào thùng tái chế vàng',
                reason: 'Bảo tồn chất lượng nguyên liệu tái sinh',
                status: 'pending',
              },
            ];
          } else {
            steps = [
              {
                id: 'step-1',
                instruction: 'Kiểm tra và bỏ vào thùng rác vô cơ cam',
                reason: 'Thu gom tập trung xử lý an toàn',
                status: 'pending',
              },
            ];
          }
        }

        // CRITICAL: At this point AI recognized successfully, BUT NO POINTS ARE AWARDED YET!
        // Display modal with checklist so student can confirm steps first.
        setActivePreparationItem(classified);
        setActivePreparationSteps(steps);
        setIsSubmittingPoints(false);
        setPointsSubmissionError(null);
        setPointsSubmissionSuccess(null);
        setIsChecklistOpen(true);
        setScanStatusText(`AI ĐÃ NHẬN DIỆN: ${classified.itemName.toUpperCase()} • CHỜ HỌC SINH XÁC NHẬN`);
      } else {
        playWarningSound();
        const msg = result.error || 'Dữ liệu phân loại không hợp lệ hoặc không xác định được loại rác. Không cộng điểm.';
        setScanStatusText('LỖI PHÂN LOẠI - KHÔNG CỘNG ĐIỂM');
        setScanErrorMessage(msg);
      }
    } catch (err: any) {
      console.error('Classification request failed strictly:', err);
      playWarningSound();
      setScanStatusText('LỖI KẾT NỐI AI - KHÔNG CỘNG ĐIỂM');
      setScanErrorMessage(
        'Không thể kết nối đến máy chủ AI nhận diện: ' +
          (err?.message || 'Lỗi mạng') +
          '. Không cộng điểm, vui lòng bấm quét lại.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Quick test demo item for live presentations and judge evaluations
  const handleSelectDemoItem = (demoId: string) => {
    const item = DEMO_WASTE_ITEMS.find((d) => d.id === demoId);
    if (!item) return;

    playClickSound();

    // If currently in Rescan Verification Mode:
    if (rescanVerificationTarget) {
      if (item.hasLiquid) {
        // Still has liquid! Verification failed
        playWarningSound();
        setScanErrorMessage(
          'Phát hiện trong chai vẫn còn nước hoặc chất lỏng bên trong. Vui lòng dốc sạch nước vào bồn rửa và bấm quét lại nghiệm thu!'
        );
        setScanStatusText('⚠️ CHAI VẪN CÒN NƯỚC: CHƯA ĐẠT TIÊU CHUẨN (+0 Đ)');
      } else {
        // Empty bottle scanned! Verification PASSED
        playVictorySound();
        const verifiedItem: WasteClassificationResult = {
          ...rescanVerificationTarget,
          itemName: rescanVerificationTarget.itemName.replace(/còn.*nước/i, 'đã đổ rỗng nước'),
          category: 'recyclable',
          points: 2,
          hasLiquid: false,
          requiresRescanEmpty: false,
          rescanVerified: true,
          rawImage: item.imageUrl || rescanVerificationTarget.rawImage,
          flowState: 'ai_recognized',
          description:
            'AI đã xác nhận chai nhựa sạch rỗng, không còn nước. Bạn có thể nhấn xác nhận để cộng điểm vào tài khoản.',
        };
        setRescanVerificationTarget(null);
        setScanErrorMessage(null);
        setActivePreparationItem(verifiedItem);
        setActivePreparationSteps([
          {
            id: 'step-1',
            instruction: 'Đã trút rỗng nước đạt chuẩn sạch (+2 Đ)',
            reason: 'Chai nhựa sạch rỗng đạt chuẩn nguyên liệu tái sinh bảo vệ môi trường',
            status: 'completed',
          },
        ]);
        setIsChecklistOpen(true);
        setScanStatusText('🎉 ĐÃ XÁC MINH CHAI RỖNG HOÀN TOÀN: MỞ KHÓA +2 ĐIỂM TÁI CHẾ!');
      }
      return;
    }

    // Normal scan mode for demo item:
    const scanId = 'scan-demo-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const resultItem: WasteClassificationResult = {
      category: item.category,
      itemName: item.itemName,
      points: item.requiresRescanEmpty ? 0 : item.points,
      confidence: item.confidence,
      description: item.description,
      binColor: item.binColor,
      recyclingTip: item.recyclingTip,
      ecoImpact: item.ecoImpact,
      rawImage: item.imageUrl,
      hasLiquid: item.hasLiquid,
      requiresRescanEmpty: item.requiresRescanEmpty,
      liquidStateDescription: item.liquidStateDescription,
      scanId,
      flowState: 'ai_recognized',
      preparationSteps: item.preparationSteps,
    };

    const steps: PreparationStep[] = (item.preparationSteps || []).map((s, idx) => ({
      id: s.id || `step-${idx + 1}`,
      instruction: s.instruction,
      reason: s.reason,
      isSafetyWarning: s.isSafetyWarning,
      status: 'pending' as const,
    }));

    setActivePreparationItem(resultItem);
    setActivePreparationSteps(steps);
    setIsSubmittingPoints(false);
    setPointsSubmissionError(null);
    setPointsSubmissionSuccess(null);
    setIsChecklistOpen(true);
    setScanStatusText(
      item.requiresRescanEmpty
        ? `⚠️ CHAI CÒN NƯỚC: TẠM KHÓA 0 ĐIỂM & BẮT BUỘC QUÉT LẠI`
        : `MẪU STEM: ${item.itemName.toUpperCase()} • CHỜ HỌC SINH XÁC NHẬN`
    );
  };

  // Trigger capture & classify from live webcam
  const handleCaptureLive = () => {
    if (!cameraActive) {
      startCamera();
      return;
    }
    const frame = captureFrame();
    if (frame) {
      handleProcessImage(frame, undefined, 'webcam', rescanVerificationTarget);
    }
  };

  // Handle uploaded image file with automatic scaling to ensure fast Gemini processing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (!base64) return;

      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const maxDim = 1200;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          handleProcessImage(tempCanvas.toDataURL('image/jpeg', 0.85), undefined, 'file_upload', rescanVerificationTarget);
        } else {
          handleProcessImage(base64, undefined, 'file_upload', rescanVerificationTarget);
        }
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Spacebar hotkey listener for live presentations and rescan event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        handleCaptureLive();
      }
    };
    const handleRescanEvent = () => {
      if (!cameraActive) {
        startCamera().then(() => {
          setTimeout(() => handleCaptureLive(), 400);
        });
      } else {
        handleCaptureLive();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('ecosort:rescan', handleRescanEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('ecosort:rescan', handleRescanEvent);
    };
  }, [cameraActive, handleCaptureLive, startCamera]);

  return (
    <div className="w-full space-y-4">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Main Webcam / Scanner Frame */}
      <div
        id="webcam-scan-container"
        className="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[500px] bg-slate-950 rounded-2xl border-2 border-emerald-500/40 overflow-hidden shadow-2xl shadow-emerald-950/40 group"
      >
        {/* Live video */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraActive ? 'opacity-100' : 'opacity-20'
          }`}
        />

        {/* Fallback Display if camera is inactive */}
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/95 backdrop-blur-md z-10">
            {isStartingCamera ? (
              <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
                <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin mb-3" />
                <h3 className="text-base font-black text-slate-100 font-mono tracking-wide">
                  ĐANG KẾT NỐI WEBCAM...
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                  Vui lòng bấm &ldquo;Cho phép&rdquo; (Allow) nếu trình duyệt yêu cầu cấp quyền Camera.
                </p>
              </div>
            ) : cameraError ? (
              <div className="flex flex-col items-center animate-in fade-in duration-200">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center text-rose-400 mb-3 shadow-lg shadow-rose-500/20">
                  <CameraOff className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-rose-300">
                  Không Thể Mở Camera
                </h3>
                <p className="text-xs text-slate-300 max-w-sm mt-1 mb-4 leading-relaxed">
                  {cameraError}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    id="btn-retry-camera"
                    onClick={() => {
                      playClickSound();
                      startCamera();
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-md shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Thử lại bật Camera</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center max-w-md animate-in fade-in duration-300">
                <div className="relative mb-3">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-cyan-500/20 border-2 border-emerald-400/50 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/20">
                    <Camera className="w-10 h-10 animate-pulse" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-black text-emerald-300 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SẴN SÀNG QUÉT RÁC BẰNG CAMERA</span>
                </div>

                <h3 className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
                  Bấm Nút Để Sử Dụng Camera Quét
                </h3>
                <p className="text-xs text-slate-400 mt-1 mb-5 leading-relaxed">
                  Webcam chỉ được kích hoạt khi bạn chủ động nhấn nút. Đưa mẫu rác thật vào khung hình để AI nhận diện và tích điểm phân loại!
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    id="btn-enable-camera-hero"
                    onClick={() => {
                      playClickSound();
                      startCamera();
                    }}
                    className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-black text-sm text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:via-teal-200 hover:to-cyan-300 shadow-xl shadow-emerald-500/40 ring-4 ring-emerald-400/40 hover:ring-emerald-300 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <Video className="w-5 h-5 text-slate-950" />
                    <span>BẬT CAMERA ĐỂ QUÉT</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Futuristic Cyber / STEM HUD Overlay */}
        <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
          {/* Top Status Bar */}
          <div className="flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700/80 text-[11px] font-mono shadow-md">
              <span className={`w-2 h-2 rounded-full ${cameraActive ? (rescanVerificationTarget ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-ping') : 'bg-amber-400'}`} />
              <span className="font-bold text-slate-200">{scanStatusText}</span>
            </div>

            <div className="flex items-center gap-2">
              {hasMultipleCameras && cameraActive && (
                <button
                  onClick={handleFlipCamera}
                  title="Đổi camera trước/sau"
                  className="p-2 rounded-xl bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700 backdrop-blur-sm transition-colors pointer-events-auto"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>
              )}
              {cameraActive && (
                <button
                  onClick={() => {
                    playClickSound();
                    stopCamera();
                  }}
                  title="Tắt Camera"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-900/90 text-rose-300 hover:text-rose-100 hover:bg-rose-950 border border-rose-500/40 backdrop-blur-sm transition-colors pointer-events-auto text-[11px] font-bold"
                >
                  <VideoOff className="w-3.5 h-3.5" />
                  <span>Tắt cam</span>
                </button>
              )}
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-700/80 text-[10px] font-mono text-cyan-400 font-bold">
                <ScanLine className="w-3.5 h-3.5" />
                <span>AI VISION V3.8</span>
              </div>
            </div>
          </div>

          {/* Rescan Verification Banner if active */}
          {rescanVerificationTarget && (
            <div className="my-2 p-3 rounded-2xl bg-gradient-to-r from-amber-950/95 via-orange-950/90 to-amber-900/90 border-2 border-amber-400 text-amber-200 shadow-xl flex items-center justify-between gap-3 pointer-events-auto animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2.5 text-xs">
                <Camera className="w-5 h-5 text-amber-400 animate-pulse flex-shrink-0" />
                <div>
                  <span className="font-black text-amber-300 block uppercase tracking-wide">
                    CHẾ ĐỘ NGHIỆM THU: {rescanVerificationTarget.itemName}
                  </span>
                  <span className="text-[11px] text-slate-200 font-medium leading-tight block">
                    Đưa chai đã trút sạch rỗng nước vào khung quét để AI xác nhận và mở khóa +2 điểm.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setRescanVerificationTarget(null);
                  setScanStatusText('ĐÃ HỦY CHẾ ĐỘ NGHIỆM THU');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-600 transition-all cursor-pointer flex-shrink-0 active:scale-95"
              >
                Hủy
              </button>
            </div>
          )}

          {/* Central Targeting Box with laser sweep when scanning */}
          <div
            className={`relative mx-auto w-48 h-48 sm:w-64 sm:h-64 border-2 border-dashed rounded-3xl flex items-center justify-center transition-all ${
              rescanVerificationTarget
                ? 'border-amber-400/80 shadow-[0_0_25px_rgba(251,191,36,0.25)]'
                : 'border-emerald-400/40'
            }`}
          >
            {/* Corner brackets */}
            <div
              className={`absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 rounded-tl-lg ${
                rescanVerificationTarget ? 'border-amber-400' : 'border-emerald-400'
              }`}
            />
            <div
              className={`absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 rounded-tr-lg ${
                rescanVerificationTarget ? 'border-amber-400' : 'border-emerald-400'
              }`}
            />
            <div
              className={`absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 rounded-bl-lg ${
                rescanVerificationTarget ? 'border-amber-400' : 'border-emerald-400'
              }`}
            />
            <div
              className={`absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 rounded-br-lg ${
                rescanVerificationTarget ? 'border-amber-400' : 'border-emerald-400'
              }`}
            />

            {/* Crosshair */}
            <div
              className={`w-4 h-0.5 ${
                rescanVerificationTarget ? 'bg-amber-400/80' : 'bg-emerald-400/60'
              }`}
            />
            <div
              className={`h-4 w-0.5 absolute ${
                rescanVerificationTarget ? 'bg-amber-400/80' : 'bg-emerald-400/60'
              }`}
            />

            {/* Scanning laser beam animation */}
            <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-bounce opacity-80" />

            {isProcessing && (
              <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-[2px] rounded-3xl flex flex-col items-center justify-center p-3 text-center pointer-events-none">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-2" />
                <span className="text-xs font-extrabold text-white font-mono tracking-wider animate-pulse">
                  AI ĐANG NHẬN DIỆN...
                </span>
              </div>
            )}
          </div>

          {/* Bottom HUD bar with category hints */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <div className="bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-800 hidden sm:block">
              {cameraActive ? 'ĐƯA MẪU RÁC VÀO TÂM KHUNG QUÉT' : 'BẤM "SỬ DỤNG CAMERA" ĐỂ BẬT QUÉT TRỰC TIẾP'}
            </div>
            <div className="bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-800 text-slate-300">
              PHÍM TẮT: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold">SPACE</kbd>
            </div>
          </div>
        </div>
      </div>

      {/* Student Self-Declaration Notice */}
      {waitingForBinDeposit && (
        <div
          id="bin-deposit-alert-banner"
          className="p-3.5 rounded-2xl bg-slate-900/90 border-2 border-emerald-500/60 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-emerald-950/30 animate-in fade-in duration-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-emerald-200 tracking-tight">
                  XÁC NHẬN TỰ KHAI CỦA HỌC SINH
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold font-mono">
                  ĐÃ BỎ THÙNG
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Đã xử lý & bỏ rác: <strong className="text-emerald-300 font-semibold">{previousItemName || 'Món rác'}</strong>. Khóa chống quét lặp lại cùng món rác.
              </p>
            </div>
          </div>

          <button
            id="btn-confirm-bin-drop"
            onClick={() => {
              playClickSound();
              handleConfirmBinDrop();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-xl shadow-emerald-500/30 ring-4 ring-emerald-400/40 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-slate-950" />
            <span>Sẵn Sàng Quét Mẫu Tiếp Theo</span>
          </button>
        </div>
      )}

      {/* AI Classification Error / Rejection Banner */}
      {scanErrorMessage && (
        <div
          id="scan-error-alert-banner"
          className="p-3.5 rounded-2xl bg-rose-950/90 border-2 border-rose-500/70 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-rose-950/40 animate-in fade-in duration-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 flex-shrink-0">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-rose-200 tracking-tight">
                  KHÔNG ĐẠT YÊU CẦU NHẬN DIỆN &bull; +0 ĐIỂM
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/30 border border-rose-400/40 text-rose-300 font-bold font-mono">
                  KHÔNG CỘNG ĐIỂM
                </span>
              </div>
              <p className="text-xs text-rose-200/90 leading-relaxed max-w-xl">
                {scanErrorMessage}
              </p>
            </div>
          </div>

          <button
            id="btn-dismiss-scan-error"
            onClick={() => setScanErrorMessage(null)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-900/80 hover:bg-rose-800 text-rose-100 font-bold text-xs border border-rose-400/50 shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <span>Đóng / Quét lại</span>
          </button>
        </div>
      )}

      {/* Main Control Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900/95 border-2 border-slate-700/80 rounded-2xl shadow-2xl">
        {/* Shutter Capture / Enable Camera Buttons */}
        <div className="flex items-start gap-2.5 flex-1 sm:flex-initial">
          {cameraActive ? (
            <>
              <div className="flex flex-col gap-1 flex-1 sm:flex-initial">
                <button
                  id="btn-capture-scan"
                  onClick={() => {
                    playClickSound();
                    handleCaptureLive();
                  }}
                  disabled={isProcessing}
                  className={`flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl font-black text-sm tracking-wide shadow-2xl transition-all cursor-pointer ${
                    isProcessing
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:via-teal-200 hover:to-cyan-300 text-slate-950 shadow-emerald-500/30 hover:shadow-emerald-500/50 ring-2 ring-emerald-300/60 hover:ring-emerald-200 hover:scale-[1.03] active:scale-95'
                  }`}
                >
                  <Camera className="w-5 h-5 text-slate-950" />
                  <span>QUÉT & NHẬN DIỆN AI</span>
                </button>
                <div className="text-[11px] font-mono text-cyan-300 text-center font-bold tracking-tight">
                  ⚡ Hạn mức quét: <span className="text-emerald-300 font-black">{remainingQuota}/30</span> lượt hôm nay
                </div>
              </div>

              <button
                id="btn-stop-camera"
                onClick={() => {
                  playClickSound();
                  stopCamera();
                }}
                title="Tắt Camera"
                className="self-start flex items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-300 hover:text-rose-300 border-2 border-slate-700 hover:border-rose-500/60 shadow-md transition-all active:scale-95 cursor-pointer font-bold text-xs"
              >
                <VideoOff className="w-4 h-4 text-rose-400" />
                <span className="hidden sm:inline">Tắt Cam</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-1 flex-1 sm:flex-initial">
              <button
                id="btn-start-camera-bar"
                onClick={() => {
                  playClickSound();
                  startCamera();
                }}
                disabled={isStartingCamera}
                className="flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl font-black text-sm tracking-wide shadow-2xl transition-all cursor-pointer bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:via-teal-200 hover:to-cyan-300 text-slate-950 shadow-emerald-500/30 hover:shadow-emerald-500/50 ring-2 ring-emerald-300/60 hover:ring-emerald-200 hover:scale-[1.03] active:scale-95"
              >
                {isStartingCamera ? (
                  <>
                    <RefreshCw className="w-5 h-5 text-slate-950 animate-spin" />
                    <span>ĐANG MỞ CAMERA...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-5 h-5 text-slate-950" />
                    <span>BẬT CAMERA QUÉT</span>
                  </>
                )}
              </button>
              <div className="text-[11px] font-mono text-cyan-300 text-center font-bold tracking-tight">
                ⚡ Hạn mức quét: <span className="text-emerald-300 font-black">{remainingQuota}/30</span> lượt hôm nay
              </div>
            </div>
          )}

          {/* Upload Photo Button */}
          <button
            type="button"
            id="btn-upload-file-scanner"
            onClick={() => {
              playClickSound();
              fileInputRef.current?.click();
            }}
            className="self-start -mt-0.5 flex items-center gap-1.5 px-3.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-2 border-slate-700 hover:border-cyan-400/60 shadow-md transition-all active:scale-95 cursor-pointer font-bold text-xs"
            title="Tải ảnh rác từ thiết bị"
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Tải ảnh</span>
          </button>
        </div>

        {/* Anti-Cheat Mode Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* Open Anti-Cheat Registry Audit Modal */}
          <button
            id="btn-open-audit-registry"
            onClick={() => {
              playClickSound();
              setIsRegistryModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border-2 border-cyan-400/70 bg-gradient-to-r from-cyan-950/90 to-blue-950/90 text-cyan-200 hover:text-white hover:border-cyan-300 hover:shadow-lg hover:shadow-cyan-500/30 hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
            title="Xem danh sách toàn bộ các mã vân tay rác đã ghi nhận để chống quét lại"
          >
            <Database className="w-4 h-4 text-cyan-400" />
            <span>Sổ Vân Tay ({fingerprintRegistry.length})</span>
          </button>


          {/* Similarity Live Gauge if there is a previous sample */}
          {lastSimilarity > 0 && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 text-[11px] font-mono font-black ${
                lastSimilarity >= 74
                  ? 'bg-rose-950 border-rose-500 text-rose-300 shadow-md shadow-rose-500/30 animate-pulse'
                  : 'bg-slate-950 border-slate-700 text-slate-300'
              }`}
              title="Độ tương đồng quang học với các mẫu đã quét"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Độ giống: {lastSimilarity}%</span>
            </div>
          )}

          {/* Blocked counter badge */}
          {duplicateBlockedCount > 0 && (
            <div
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-950 border-2 border-rose-500/80 text-[11px] text-rose-200 font-black shadow-md shadow-rose-950/50"
              title="Số lần hệ thống đã ngăn chặn hành vi quét lặp để gian lận"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>Đã chặn: {duplicateBlockedCount} lần</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick STEM Test Cases for presentations and evaluation */}
      <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-2.5 shadow-md">
        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-bold">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="uppercase text-[11px] tracking-wide text-slate-200">Mẫu thử STEM (Test Cases):</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            id="btn-test-bottle-liquid"
            onClick={() => handleSelectDemoItem('demo-bottle-liquid')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-950/80 border border-amber-500/60 text-amber-200 hover:bg-amber-900/90 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
            title="Thử nghiệm chai nhựa còn nước -> Tạm khóa 0 điểm & Bắt buộc quét lại nghiệm thu"
          >
            <span>💧 Chai còn nước (Khóa 0đ)</span>
          </button>
          <button
            type="button"
            id="btn-test-bottle-empty"
            onClick={() => handleSelectDemoItem('demo-pet-bottle')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-teal-950/80 border border-teal-500/60 text-teal-200 hover:bg-teal-900/90 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
            title="Thử nghiệm chai nhựa đã rỗng sạch -> Nghiệm thu đạt chuẩn +2 điểm tái chế"
          >
            <span>🍶 Chai đã rỗng sạch (+2đ)</span>
          </button>
          <button
            type="button"
            id="btn-test-banana"
            onClick={() => handleSelectDemoItem('demo-banana')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 hover:bg-emerald-900/90 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
            title="Thử nghiệm vỏ chuối -> Rác hữu cơ +1đ"
          >
            <span>🍌 Vỏ chuối (+1đ)</span>
          </button>
          <button
            type="button"
            id="btn-test-battery"
            onClick={() => handleSelectDemoItem('demo-battery')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-orange-950/80 border border-orange-500/60 text-orange-200 hover:bg-orange-900/90 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
            title="Thử nghiệm pin cũ nguy hại -> Rác vô cơ +3đ"
          >
            <span>🔋 Pin cũ (+3đ)</span>
          </button>
        </div>
      </div>

      {/* 3 Categories Summary Rule Card */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Rác Hữu Cơ: +1 điểm */}
        <div className="p-3.5 rounded-2xl bg-emerald-950/50 border-2 border-emerald-500/50 flex flex-col justify-between shadow-lg shadow-emerald-950/30 hover:border-emerald-400 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-black uppercase text-emerald-300 tracking-tight">Rác Hữu Cơ</span>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-mono shadow-sm">
              +1 ĐIỂM
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-tight">
            Vỏ chuối, hoa quả, rau củ thừa, bã trà/cà phê, lá cây.
          </p>
          <div className="mt-2 text-[10px] text-emerald-300 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Thùng Xanh Lá (Ủ phân)</span>
          </div>
        </div>

        {/* Rác Tái Chế: +2 điểm */}
        <div className="p-3.5 rounded-2xl bg-amber-950/50 border-2 border-amber-500/50 flex flex-col justify-between shadow-lg shadow-amber-950/30 hover:border-amber-400 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-black uppercase text-amber-300 tracking-tight">Rác Tái Chế</span>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono shadow-sm">
              +2 ĐIỂM
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-tight">
            Chai nhựa PET, lon nhôm, vỏ hộp sữa, bìa carton, giấy.
          </p>
          <div className="mt-2 text-[10px] text-amber-300 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Thùng Vàng (Tái sinh)</span>
          </div>
        </div>

        {/* Rác Vô Cơ: +3 điểm */}
        <div className="p-3.5 rounded-2xl bg-orange-950/50 border-2 border-orange-500/50 flex flex-col justify-between shadow-lg shadow-orange-950/30 hover:border-orange-400 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-black uppercase text-orange-300 tracking-tight">Rác Vô Cơ</span>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-mono shadow-sm">
              +3 ĐIỂM
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-tight">
            Túi nilon, hộp xốp, pin cũ, rác khó phân hủy cần xử lý riêng.
          </p>
          <div className="mt-2 text-[10px] text-orange-300 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span>Thùng Cam (Thu gom đặc biệt)</span>
          </div>
        </div>
      </div>

      {/* Anti-Cheat Audit Registry Modal */}
      <AntiCheatAuditModal
        isOpen={isRegistryModalOpen}
        onClose={() => setIsRegistryModalOpen(false)}
        registry={fingerprintRegistry}
        onClearRegistry={() => {
          clearFingerprintRegistry();
          setFingerprintRegistry([]);
          setPreviousFingerprint(null);
          setLastDemoItemId(null);
          setLastSimilarity(0);
          setScanStatusText('ĐÃ XÓA SỔ VÂN TAY: SẴN SÀNG CHO VÒNG THI MỚI');
        }}
        onTestRescanItem={(record) => {
          setIsRegistryModalOpen(false);
          playWarningSound();
          setDuplicateBlockedCount((prev) => prev + 1);
          setLastSimilarity(100);
          const alertInfo: DuplicateAlertInfo = {
            itemName: record.itemName,
            similarity: 1.0,
            timeSinceLastScanMs: Math.max(1000, Date.now() - record.timestamp),
            reason: `Phát hiện hành vi quét lại hình ảnh vật thể "${record.itemName}" đã lưu trong sổ vân tay!`,
            suggestedAction:
              'Không thể dùng 1 ảnh để quét đi quét lại nhận điểm. Hệ thống đã lưu chữ ký số và ảnh đối chứng.',
            isExactFileMatch: true,
            matchedRecord: {
              id: record.id,
              itemName: record.itemName,
              timestamp: record.timestamp,
              thumbnail: record.thumbnail,
            },
            currentThumbnail: record.thumbnail,
          };
          if (onDuplicateDetected) {
            onDuplicateDetected(alertInfo);
          }
          setScanStatusText(`🚫 GIAN LẬN: QUÉT LẶP ${record.itemName.toUpperCase()} (+0 ĐIỂM)`);
        }}
      />
      {/* Preparation Steps Checklist Modal */}
      <PreparationChecklistModal
        isOpen={isChecklistOpen}
        item={activePreparationItem}
        steps={activePreparationSteps}
        onUpdateStepStatus={handleUpdateStepStatus}
        onConfirmComplete={handleConfirmCompletePreparation}
        onCancel={handleCancelPreparation}
        isSubmitting={isSubmittingPoints}
        errorMessage={pointsSubmissionError}
        successMessage={pointsSubmissionSuccess}
        onRetry={handleConfirmCompletePreparation}
        onStartRescan={handleStartRescan}
      />
    </div>
  );
};
