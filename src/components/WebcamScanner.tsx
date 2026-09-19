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
} from 'lucide-react';
import {
  WasteClassificationResult,
  WasteCategory,
  DuplicateAlertInfo,
  ScannedFingerprintRecord,
} from '../types';
import { playScanSound, playPointSound, playWarningSound, playClickSound } from '../utils/audio';
import {
  computeImageFingerprint,
  evaluateAgainstRegistry,
  calculateHashSimilarity,
  loadFingerprintRegistry,
  registerScannedFingerprint,
  clearFingerprintRegistry,
  computeFastChecksum,
  FingerprintResult,
} from '../utils/imageFingerprint';
import { AntiCheatAuditModal } from './AntiCheatAuditModal';

interface WebcamScannerProps {
  onClassified: (result: WasteClassificationResult) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  onDuplicateDetected?: (alert: DuplicateAlertInfo) => void;
  onOpenGuide?: () => void;
}

export const WebcamScanner: React.FC<WebcamScannerProps> = ({
  onClassified,
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
  const [lastSimilarity, setLastSimilarity] = useState<number>(0);
  const [duplicateBlockedCount, setDuplicateBlockedCount] = useState(0);

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

  // Capture frame from video to base64
  const captureFrame = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // Confirm that waste has been dropped into bin (clears duplicate lock)
  const handleConfirmBinDrop = () => {
    setWaitingForBinDeposit(false);
    setPreviousFingerprint(null);
    setLastDemoItemId(null);
    setLastSimilarity(0);
    setScanStatusText('CẢM BIẾN XÁC NHẬN: RÁC ĐÃ VÀO THÙNG & SẴN SÀNG');
  };

  // Perform AI Classification on an image base64
  const handleProcessImage = async (
    base64Image: string,
    hint?: string,
    scanSource: 'webcam' | 'file_upload' = 'webcam'
  ) => {
    if (isProcessing) return;

    // 1. Anti-cheat duplicate evaluation against the ENTIRE registry of scanned fingerprints
    let currentFingerprint: FingerprintResult | null = null;
    if (antiCheatEnabled) {
      currentFingerprint = await computeImageFingerprint(base64Image);

      const duplicateCheck = evaluateAgainstRegistry(
        currentFingerprint,
        fingerprintRegistry,
        { similarityThreshold: 0.74 }
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
        };
        if (onDuplicateDetected) {
          onDuplicateDetected(alertInfo);
        }
        setScanStatusText(
          duplicateCheck.isExactFileMatch
            ? '🚫 GIAN LẬN: TỆP ẢNH ĐÃ TỪNG DÙNG (+0 ĐIỂM)'
            : `⚠️ GIAN LẬN: TRÙNG MẪU ${simPercent}% (+0 ĐIỂM)`
        );
        return;
      }
    }

    setIsProcessing(true);
    setScanStatusText('ĐANG PHÂN TÍCH VẬT THỂ AI...');
    setScanErrorMessage(null);
    playScanSound();
    setLastScannedImage(base64Image);

    try {
      const response = await fetch('/api/classify-waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, hint }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result) {
        playWarningSound();
        const errDesc =
          result?.error ||
          `Máy chủ nhận diện phản hồi lỗi (${response.status}). Vui lòng đưa mẫu rác rõ nét vào khung quét và thử lại.`;
        setScanStatusText('LỖI NHẬN DIỆN - KHÔNG CỘNG ĐIỂM');
        setScanErrorMessage(errDesc);
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

      // 2. Reject non-waste images (selfie, face, pet, clean room, etc.)
      if (result.isNotWaste || result.data?.isWaste === false || result.data?.points === 0) {
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
        const classified: WasteClassificationResult = {
          ...result.data,
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
            checksum: currentFingerprint.checksum,
            timestamp: Date.now(),
            itemName: classified.itemName,
            category: classified.category,
            points: classified.points,
            thumbnail: currentFingerprint.thumbnail,
          };
          registerScannedFingerprint(newRecord);
          setFingerprintRegistry(loadFingerprintRegistry());
          setPreviousFingerprint(currentFingerprint);
        }
        setPreviousItemName(classified.itemName);
        if (antiCheatEnabled) {
          setWaitingForBinDeposit(true);
        }

        playPointSound(classified.points);
        onClassified(classified);
        setScanStatusText(`ĐÃ NHẬN DIỆN: ${classified.itemName.toUpperCase()} (+${classified.points} Đ)`);
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

  // Trigger capture & classify from live webcam
  const handleCaptureLive = () => {
    if (!cameraActive) {
      startCamera();
      return;
    }
    const frame = captureFrame();
    if (frame) {
      handleProcessImage(frame, undefined, 'webcam');
    }
  };

  // Handle uploaded image file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        handleProcessImage(base64, undefined, 'file_upload');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Spacebar hotkey listener for live presentations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        handleCaptureLive();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

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
              <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
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

          {/* Central Targeting Box with laser sweep when scanning */}
          <div className="relative mx-auto w-48 h-48 sm:w-64 sm:h-64 border-2 border-dashed border-emerald-400/40 rounded-3xl flex items-center justify-center">
            {/* Corner brackets */}
            <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-emerald-400 rounded-br-lg" />

            {/* Crosshair */}
            <div className="w-4 h-0.5 bg-emerald-400/60" />
            <div className="h-4 w-0.5 bg-emerald-400/60 absolute" />

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

      {/* Anti-Cheat Sensor & Bin Deposit Confirmation Banner */}
      {waitingForBinDeposit && (
        <div
          id="bin-deposit-alert-banner"
          className="p-3.5 rounded-2xl bg-amber-950/70 border-2 border-amber-500/60 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-amber-950/30 animate-in fade-in duration-300"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
              <Trash2 className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-amber-200 tracking-tight">
                  CẢM BIẾN CHỜ BỎ RÁC VÀO THÙNG
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/30 border border-amber-400/40 text-amber-300 font-bold font-mono">
                  KHÓA QUÉT LẶP
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Vừa quét: <strong className="text-amber-300 font-semibold">{previousItemName || 'Món rác'}</strong>. Không thể quét lại cùng món này để lấy điểm.
              </p>
            </div>
          </div>

          <button
            id="btn-confirm-bin-drop"
            onClick={() => {
              playClickSound();
              handleConfirmBinDrop();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-xl shadow-emerald-500/30 ring-4 ring-emerald-400/40 animate-pulse hover:animate-none hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-slate-950" />
            <span>Xác Nhận Đã Bỏ Thùng</span>
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
        <div className="flex items-center gap-2.5 flex-1 sm:flex-initial">
          {cameraActive ? (
            <>
              <button
                id="btn-capture-scan"
                onClick={() => {
                  playClickSound();
                  handleCaptureLive();
                }}
                disabled={isProcessing}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl font-black text-sm tracking-wide shadow-2xl transition-all cursor-pointer ${
                  isProcessing
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:via-teal-200 hover:to-cyan-300 text-slate-950 shadow-emerald-500/30 hover:shadow-emerald-500/50 ring-2 ring-emerald-300/60 hover:ring-emerald-200 hover:scale-[1.03] active:scale-95'
                }`}
              >
                <Camera className="w-5 h-5 text-slate-950" />
                <span>QUÉT & NHẬN DIỆN AI</span>
              </button>

              <button
                id="btn-stop-camera"
                onClick={() => {
                  playClickSound();
                  stopCamera();
                }}
                title="Tắt Camera"
                className="flex items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-800 hover:bg-rose-950/70 text-slate-300 hover:text-rose-300 border-2 border-slate-700 hover:border-rose-500/60 shadow-md transition-all active:scale-95 cursor-pointer font-bold text-xs"
              >
                <VideoOff className="w-4 h-4 text-rose-400" />
                <span className="hidden sm:inline">Tắt Cam</span>
              </button>
            </>
          ) : (
            <button
              id="btn-start-camera-bar"
              onClick={() => {
                playClickSound();
                startCamera();
              }}
              disabled={isStartingCamera}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl font-black text-sm tracking-wide shadow-2xl transition-all cursor-pointer bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:via-teal-200 hover:to-cyan-300 text-slate-950 shadow-emerald-500/30 hover:shadow-emerald-500/50 ring-2 ring-emerald-300/60 hover:ring-emerald-200 hover:scale-[1.03] active:scale-95"
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
          )}
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
    </div>
  );
};
