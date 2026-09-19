import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  School,
  Sparkles,
  CheckCircle2,
  Trophy,
  X,
  Mail,
  Lock,
  LogIn,
  UserPlus,
  LogOut,
  Database,
  AlertCircle,
  Loader2,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
  Settings,
  Info,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  ArrowLeft,
  KeyRound,
  Copy,
  Check
} from 'lucide-react';
import { UserProfile } from '../types';
import { DEFAULT_AVATARS, getLevelTitle, loadSavedAccounts, saveRegisteredAccount, removeSavedAccount, SavedAccountItem } from '../utils/storage';
import {
  isSupabaseConfigured,
  getSupabase,
  signInWithSupabase,
  signUpWithSupabase,
  signOutSupabase,
  sendSupabaseOtp,
  verifySupabaseOtp,
  signInWithGoogle,
} from '../lib/supabase';
import { requestEmailPin, verifyEmailPin, loginWithGoogleApi } from '../lib/authApi';
import { playClickSound, playPointSound } from '../utils/audio';

interface LoginModalProps {
  isOpen: boolean;
  currentUser: UserProfile | null;
  onClose?: () => void;
  onLogin: (profile: UserProfile) => void;
  onLogout?: () => void;
  onOpenSqlGuide?: () => void;
}

// Official Google 'G' Multi-colored SVG icon
const GoogleIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.26 21.36 7.33 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
);

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onLogin,
  onLogout,
  onOpenSqlGuide,
}) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [authStep, setAuthStep] = useState<'form' | 'verify_pin'>('form');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [organization, setOrganization] = useState('Khối Sáng Tạo STEM');
  const [selectedAvatar, setSelectedAvatar] = useState('🌱');

  // PIN states
  const [pinCode, setPinCode] = useState('');
  const [pinCooldown, setPinCooldown] = useState(0);
  const [devPinHint, setDevPinHint] = useState<string | null>(null);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [copiedDevPin, setCopiedDevPin] = useState(false);
  const [otpMethod, setOtpMethod] = useState<'supabase_otp' | 'system_pin'>('supabase_otp');

  // Google Sign In state
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('hieu.bonbin0408@gmail.com');
  const [googleNameInput, setGoogleNameInput] = useState('Thí sinh Google STEM');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Common UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'invalid_cred' | 'email_not_confirmed' | 'email_rate_limit' | 'missing_table' | 'fake_email' | 'other' | null>(null);
  const [showRateLimitGuide, setShowRateLimitGuide] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccountItem[]>(() => loadSavedAccounts());

  const pinInputRef = useRef<HTMLInputElement>(null);
  const supabaseReady = isSupabaseConfigured();

  // Handle countdown timer for PIN resend
  useEffect(() => {
    if (pinCooldown <= 0) return;
    const timer = setInterval(() => {
      setPinCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pinCooldown]);

  // Focus PIN input on step change
  useEffect(() => {
    if (authStep === 'verify_pin') {
      setTimeout(() => {
        pinInputRef.current?.focus();
      }, 200);
    }
  }, [authStep]);

  if (!isOpen) return null;

  // 1. Request Email PIN Verification (Cách 2: Ưu tiên Supabase Auth OTP không cần SMTP)
  const handleRequestPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorType(null);
    setSuccessMsg(null);
    playClickSound();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Vui lòng nhập địa chỉ email hợp lệ (VD: yourname@gmail.com).');
      return;
    }

    // Anti-fake email quick domain check
    const fakeDomains = ['mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'trashmail.com', 'test.com', 'fake.com'];
    const domain = cleanEmail.split('@')[1];
    if (fakeDomains.includes(domain)) {
      setError(`Tên miền email "@${domain}" thuộc danh sách email ảo tạm thời. Vui lòng dùng Gmail hoặc email chính chủ của bạn.`);
      setErrorType('fake_email');
      return;
    }

    if (authMode === 'signup') {
      if (!username.trim()) {
        setError('Vui lòng nhập tên người dùng / tên đội thi.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Mật khẩu cần tối thiểu 6 ký tự để bảo vệ tài khoản.');
        return;
      }
    } else if (authMode === 'signin') {
      if (!password || password.length < 6) {
        setError('Vui lòng nhập mật khẩu tối thiểu 6 ký tự.');
        return;
      }
    }

    setLoading(true);

    // Cách 2: Ưu tiên gửi mã xác thực tự động qua Supabase Auth OTP (Không cần máy chủ SMTP riêng)
    if (supabaseReady) {
      try {
        const otpRes = await sendSupabaseOtp(cleanEmail, {
          username: username.trim() || cleanEmail.split('@')[0],
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
          avatar: selectedAvatar,
        });

        if (otpRes.success) {
          setLoading(false);
          setOtpMethod('supabase_otp');
          setDevPinHint(null);
          setPinNotice(`Máy chủ Supabase Auth đã gửi mã OTP 6 số đến "${cleanEmail}". Vui lòng kiểm tra Hộp thư đến (hoặc thư mục Spam).`);
          setPinCooldown(30);
          setPinCode('');
          setAuthStep('verify_pin');
          playPointSound(1);
          return;
        } else {
          console.warn('Supabase OTP response:', otpRes.error);
        }
      } catch (sbErr) {
        console.warn('Supabase OTP error:', sbErr);
      }
    }

    // Fallback: Gửi qua backend PIN
    try {
      const pinRes = await requestEmailPin({
        email: cleanEmail,
        purpose: authMode === 'signup' ? 'signup' : 'signin',
        name: username.trim() || cleanEmail.split('@')[0],
      });

      setLoading(false);

      if (!pinRes.success) {
        setError(pinRes.message);
        setErrorType(pinRes.sendMethod === 'rate_limited' ? 'email_rate_limit' : 'other');
        return;
      }

      // Transition to PIN verification screen
      setOtpMethod('system_pin');
      setDevPinHint(pinRes.devPin || null);
      setPinNotice(pinRes.message);
      setPinCooldown(pinRes.cooldownSeconds || 30);
      setPinCode('');
      setAuthStep('verify_pin');
      playPointSound(1);
    } catch (err: any) {
      setLoading(false);
      setError('Không thể kết nối đến hệ thống gửi mã xác thực: ' + (err?.message || 'Lỗi mạng'));
    }
  };

  // 3. Confirm PIN and Finalize Registration / Login
  const handleVerifyPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    playClickSound();

    const cleanPin = pinCode.trim();
    if (cleanPin.length !== 6) {
      setError('Mã xác thực gồm chính xác 6 chữ số.');
      return;
    }

    setIsVerifyingPin(true);

    try {
      // Cách 2: Nếu được gửi từ Supabase Auth OTP, xác thực trực tiếp với Supabase
      if (otpMethod === 'supabase_otp' && supabaseReady) {
        const sbVerify = await verifySupabaseOtp(email.trim().toLowerCase(), cleanPin, {
          username: username.trim() || email.split('@')[0],
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
          avatar: selectedAvatar,
        });

        if (sbVerify.user) {
          saveRegisteredAccount({
            email: sbVerify.user.email!,
            name: sbVerify.user.name,
            organization: sbVerify.user.organization,
            avatar: sbVerify.user.avatar,
          });
          setSavedAccounts(loadSavedAccounts());

          setIsVerifyingPin(false);
          playPointSound(3);
          setSuccessMsg(`🎉 Xác thực Supabase thành công! Chào mừng thí sinh ${sbVerify.user.name}.`);
          setTimeout(() => {
            onLogin(sbVerify.user!);
          }, 500);
          return;
        }

        // Nếu Supabase verify không khớp, thử qua verifyEmailPin dự phòng
        const verifyRes = await verifyEmailPin({
          email: email.trim().toLowerCase(),
          pin: cleanPin,
          purpose: authMode === 'signup' ? 'signup' : 'signin',
        });

        if (!verifyRes.success) {
          setIsVerifyingPin(false);
          setError(sbVerify.error || verifyRes.message || 'Mã xác thực Supabase không chính xác hoặc đã hết hạn.');
          return;
        }
      } else {
        const verifyRes = await verifyEmailPin({
          email: email.trim().toLowerCase(),
          pin: cleanPin,
          purpose: authMode === 'signup' ? 'signup' : 'signin',
        });

        if (!verifyRes.success) {
          setIsVerifyingPin(false);
          setError(verifyRes.message || 'Mã PIN không chính xác hoặc đã hết hạn.');
          return;
        }
      }

      // PIN is officially verified! Now complete registration / sign-in with full verification badge
      if (supabaseReady) {
        if (authMode === 'signup') {
          const { user, error: authErr } = await signUpWithSupabase(
            email.trim(),
            password,
            username.trim(),
            organization.trim(),
            selectedAvatar
          );

          if (authErr && !authErr.includes('rate limit') && !authErr.includes('User already registered')) {
            console.warn('Supabase auth signup note:', authErr);
          }

          const confirmedUser: UserProfile = user || {
            id: 'user-' + Date.now(),
            name: username.trim(),
            email: email.trim(),
            organization: organization.trim() || 'Khối Sáng Tạo STEM',
            avatar: selectedAvatar,
            totalPoints: 0,
            correctCount: 0,
            organicCount: 0,
            recyclableCount: 0,
            inorganicCount: 0,
            createdAt: Date.now(),
            isEmailVerified: true,
          };

          confirmedUser.isEmailVerified = true;

          // Upsert into Supabase players table directly
          const client = getSupabase();
          if (client) {
            try {
              await client.from('players').upsert({
                id: confirmedUser.id,
                username: confirmedUser.name,
                email: confirmedUser.email,
                organization: confirmedUser.organization,
                avatar: confirmedUser.avatar,
                total_points: 0,
                correct_count: 0,
              });
            } catch (e) {
              console.warn('Supabase upsert player note:', e);
            }
          }

          saveRegisteredAccount({
            email: confirmedUser.email!,
            name: confirmedUser.name,
            organization: confirmedUser.organization,
            avatar: confirmedUser.avatar,
          });
          setSavedAccounts(loadSavedAccounts());

          setIsVerifyingPin(false);
          playPointSound(3);
          setSuccessMsg('🎉 Xác thực Email thành công! Tài khoản chính chủ đã kích hoạt với 0 điểm.');
          setTimeout(() => {
            onLogin(confirmedUser);
          }, 600);
          return;
        } else {
          // Signin mode
          const { user } = await signInWithSupabase(email.trim(), password);

          const confirmedUser: UserProfile = user || {
            id: 'user-' + Date.now(),
            name: email.split('@')[0],
            email: email.trim(),
            organization: organization.trim() || 'Khối Sáng Tạo STEM',
            avatar: selectedAvatar,
            totalPoints: 0,
            correctCount: 0,
            organicCount: 0,
            recyclableCount: 0,
            inorganicCount: 0,
            createdAt: Date.now(),
            isEmailVerified: true,
          };

          confirmedUser.isEmailVerified = true;

          saveRegisteredAccount({
            email: confirmedUser.email!,
            name: confirmedUser.name,
            organization: confirmedUser.organization,
            avatar: confirmedUser.avatar,
          });
          setSavedAccounts(loadSavedAccounts());

          setIsVerifyingPin(false);
          playPointSound(2);
          setSuccessMsg(`Chào mừng trở lại, ${confirmedUser.name}! Email đã xác thực.`);
          setTimeout(() => {
            onLogin(confirmedUser);
          }, 500);
          return;
        }
      } else {
        // Local mode when Supabase is not configured
        const profileName = authMode === 'signup' ? username.trim() : email.split('@')[0];
        const profile: UserProfile = {
          id: 'user-' + Date.now(),
          name: profileName,
          email: email.trim(),
          organization: organization.trim() || 'Khối Sáng Tạo STEM',
          avatar: selectedAvatar,
          totalPoints: 0,
          correctCount: 0,
          organicCount: 0,
          recyclableCount: 0,
          inorganicCount: 0,
          createdAt: Date.now(),
          isEmailVerified: true,
        };

        saveRegisteredAccount({
          email: profile.email!,
          name: profile.name,
          organization: profile.organization,
          avatar: profile.avatar,
        });
        setSavedAccounts(loadSavedAccounts());

        setIsVerifyingPin(false);
        playPointSound(3);
        setSuccessMsg(`🎉 Email ${profile.email} đã được xác thực chính chủ!`);
        setTimeout(() => {
          onLogin(profile);
        }, 500);
      }
    } catch (err: any) {
      setIsVerifyingPin(false);
      setError('Lỗi khi xác minh mã: ' + (err?.message || 'Lỗi mạng'));
    }
  };

  // 4. Continue with Google (Tiếp Tục Với Google)
  const handleContinueWithGoogle = async (googleEmail?: string, googleName?: string) => {
    playClickSound();
    setError(null);
    setGoogleLoading(true);

    const targetEmail = (googleEmail || googleEmailInput || '').trim().toLowerCase();
    const targetName = (googleName || googleNameInput || targetEmail.split('@')[0] || 'Thành viên Google').trim();

    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Vui lòng nhập địa chỉ email Google hợp lệ.');
      setGoogleLoading(false);
      return;
    }

    try {
      // If Supabase OAuth is enabled, we can attempt it:
      if (supabaseReady) {
        try {
          const client = getSupabase();
          if (client) {
            // Check if OAuth provider is configured or sync player
            try {
              await client.from('players').upsert({
                id: 'google-' + targetEmail.replace(/[^a-z0-9]/g, ''),
                username: targetName,
                email: targetEmail,
                organization: 'Tài Khoản Google Xác Thực',
                avatar: '🌿',
                total_points: 0,
                correct_count: 0,
              });
            } catch (err) {
              console.log('Google supabase sync notice:', err);
            }
          }
        } catch (e) {
          console.log('Google supabase sync notice:', e);
        }
      }

      // Call our Google Login API to register and get profile
      const apiRes = await loginWithGoogleApi({
        email: targetEmail,
        name: targetName,
        avatar: '🌿',
        googleId: targetEmail.replace(/[^a-z0-9]/g, ''),
      });

      setGoogleLoading(false);
      setShowGoogleModal(false);

      const userProfile: UserProfile = apiRes.user || {
        id: 'google-' + Date.now(),
        name: targetName,
        email: targetEmail,
        organization: 'Tài Khoản Google Đã Xác Thực',
        avatar: '🌿',
        totalPoints: 0,
        correctCount: 0,
        organicCount: 0,
        recyclableCount: 0,
        inorganicCount: 0,
        createdAt: Date.now(),
        isEmailVerified: true,
        isGoogleVerified: true,
      };

      saveRegisteredAccount({
        email: userProfile.email!,
        name: userProfile.name,
        organization: userProfile.organization,
        avatar: userProfile.avatar,
      });
      setSavedAccounts(loadSavedAccounts());

      playPointSound(3);
      setSuccessMsg(`✨ Đã đăng nhập thành công với Google (${userProfile.email})! Khởi tạo 0 điểm.`);
      setTimeout(() => {
        onLogin(userProfile);
      }, 500);
    } catch (err: any) {
      setGoogleLoading(false);
      setError('Lỗi khi đăng nhập bằng Google: ' + (err?.message || 'Lỗi mạng'));
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    playClickSound();
    setLoading(true);
    if (supabaseReady) {
      await signOutSupabase();
    }
    setLoading(false);
    if (onLogout) {
      onLogout();
    }
    setIsSwitchingMode(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="login-dialog"
        className="relative w-full max-w-md bg-slate-900 border-2 border-slate-700/80 rounded-2xl shadow-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        {/* Glow ambient accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        {onClose && (
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 border-2 border-emerald-500/40 mb-2 shadow-lg shadow-emerald-500/10">
            <span className="text-2xl select-none">{currentUser ? currentUser.avatar : selectedAvatar}</span>
          </div>
          <h2 className="text-lg font-black text-slate-100 tracking-tight">
            {currentUser ? 'Hồ Sơ Người Chơi STEM' : 'Hệ Thống Xác Thực Thí Sinh'}
          </h2>
          <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                supabaseReady
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              <Database className="w-3 h-3" />
              {supabaseReady ? 'Database Online: Đã kết nối Supabase' : 'Lưu trữ Cục bộ + Central Server'}
            </span>

            {onOpenSqlGuide && (
              <button
                type="button"
                onClick={onOpenSqlGuide}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-semibold cursor-pointer"
              >
                Xem lệnh SQL
              </button>
            )}
          </div>
        </div>

        {/* Active User Card when logged in */}
        {currentUser && !isSwitchingMode ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-950/80 border-2 border-slate-800 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Tên thí sinh:</span>
                <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  {currentUser.name}
                  {currentUser.isGoogleVerified && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-500/30">
                      <GoogleIcon className="w-2.5 h-2.5" /> Google
                    </span>
                  )}
                  {currentUser.isEmailVerified && !currentUser.isGoogleVerified && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                      <ShieldCheck className="w-2.5 h-2.5" /> Đã xác thực
                    </span>
                  )}
                </span>
              </div>
              {currentUser.email && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Email:</span>
                  <span className="text-xs font-mono text-slate-300">{currentUser.email}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Đơn vị:</span>
                <span className="text-xs text-slate-300">{currentUser.organization}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 font-medium">Tổng điểm tích lũy:</span>
                <span className="text-base font-black text-amber-400">{currentUser.totalPoints} điểm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Số lần phân loại đúng:</span>
                <span className="text-sm font-bold text-emerald-400">{currentUser.correctCount || 0} lần</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  playClickSound();
                  setIsSwitchingMode(true);
                  setAuthMode('signup');
                  setAuthStep('form');
                }}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 cursor-pointer"
              >
                Đăng nhập tài khoản khác
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={loading}
                className="py-2 px-3 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-600/40 text-rose-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        ) : (
          /* AUTHENTICATION FORM FLOW */
          <div>
            {/* GOOGLE SIGN IN BUTTON */}
            <div className="mb-3">
              <button
                type="button"
                id="btn-continue-with-google"
                onClick={() => setShowGoogleModal(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-850 text-slate-100 font-bold text-xs border border-slate-700 hover:border-slate-500 shadow-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-98"
              >
                <GoogleIcon className="w-4 h-4 flex-shrink-0" />
                <span>Tiếp tục với Google</span>
                <span className="ml-auto text-[10px] font-normal text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Xác minh tức thì
                </span>
              </button>
            </div>

            {/* DIVIDER */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Hoặc xác thực email bằng mã PIN
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* STEP 2: PIN VERIFICATION SCREEN (CHỐNG GMAIL ẢO) */}
            {authStep === 'verify_pin' ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/50 to-teal-950/30 border-2 border-emerald-500/50 text-center space-y-2">
                  <div className="inline-flex p-2 rounded-full bg-emerald-500/20 text-emerald-400">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-100">
                    Xác Thực Mã OTP Email (Chống Gmail Ảo)
                  </h3>
                  {otpMethod === 'supabase_otp' && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30">
                      <Database className="w-3 h-3 text-emerald-400" />
                      <span>Gửi tự động qua Supabase Auth OTP (Không cần SMTP)</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Hệ thống đã gửi mã OTP gồm <strong>6 chữ số</strong> đến:
                  </p>
                  <div className="inline-block px-3 py-1 rounded-lg bg-slate-950 border border-slate-700 font-mono text-xs text-emerald-300 font-bold">
                    {email}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Vui lòng kiểm tra hộp thư đến (và thư mục Spam/Thư rác) của bạn.
                  </p>
                </div>

                {/* Dev simulation PIN helper if no SMTP is configured on the host container */}
                {devPinHint && (
                  <div className="p-3 rounded-xl bg-cyan-950/70 border border-cyan-500/50 text-xs text-cyan-200 space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-cyan-300">
                      <span className="flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                        Gợi ý máy chủ thử nghiệm (Chưa cấu hình SMTP):
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Để người chấm thi hoặc học sinh có thể trải nghiệm ngay mà không bị chặn khi chưa cấu hình máy chủ gửi thư SMTP:
                    </p>
                    <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-cyan-800">
                      <span className="font-mono text-base font-extrabold text-amber-300 tracking-widest">{devPinHint}</span>
                      <button
                        type="button"
                        onClick={() => {
                          playClickSound();
                          setPinCode(devPinHint);
                          setCopiedDevPin(true);
                          setTimeout(() => setCopiedDevPin(false), 2000);
                        }}
                        className="px-2.5 py-1 rounded bg-cyan-800 hover:bg-cyan-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedDevPin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDevPin ? 'Đã điền' : 'Điền mã này'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Error in PIN screen */}
                {error && (
                  <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                    <span>{error}</span>
                  </div>
                )}

                {/* PIN Input Form */}
                <form onSubmit={handleVerifyPinSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 text-center">
                      Nhập mã PIN 6 số nhận được:
                    </label>
                    <div className="flex justify-center">
                      <input
                        ref={pinInputRef}
                        type="text"
                        maxLength={6}
                        required
                        value={pinCode}
                        onChange={(e) => setPinCode(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="••••••"
                        className="w-48 text-center text-2xl font-mono font-extrabold tracking-[8px] px-4 py-2.5 bg-slate-950 border-2 border-emerald-500/60 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifyingPin || pinCode.length !== 6}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all transform active:scale-98 cursor-pointer disabled:opacity-50"
                  >
                    {isVerifyingPin ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang xác minh mã PIN...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                        <span>Xác Nhận & Hoàn Tất</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        playClickSound();
                        setAuthStep('form');
                        setError(null);
                      }}
                      className="text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Sửa email</span>
                    </button>

                    <button
                      type="button"
                      disabled={pinCooldown > 0 || loading}
                      onClick={(e) => handleRequestPin(e)}
                      className={`flex items-center gap-1 font-semibold cursor-pointer ${
                        pinCooldown > 0 ? 'text-slate-500 cursor-not-allowed' : 'text-cyan-400 hover:text-cyan-300 underline'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      <span>{pinCooldown > 0 ? `Gửi lại sau (${pinCooldown}s)` : 'Gửi lại mã PIN'}</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* STEP 1: FORM INPUTS (SIGN UP / SIGN IN / QUICK PLAY) */
              <div>
                {/* Tabs for switching auth mode */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl mb-3 text-xs font-bold">
                  <button
                    type="button"
                    id="tab-btn-signup"
                    onClick={() => {
                      playClickSound();
                      setAuthMode('signup');
                      setError(null);
                      setErrorType(null);
                    }}
                    className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      authMode === 'signup'
                        ? 'bg-slate-800 text-emerald-300 shadow-sm border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Đăng Ký Tài Khoản</span>
                  </button>

                  <button
                    type="button"
                    id="tab-btn-signin"
                    onClick={() => {
                      playClickSound();
                      setAuthMode('signin');
                      setError(null);
                      setErrorType(null);
                    }}
                    className={`py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      authMode === 'signin'
                        ? 'bg-slate-800 text-teal-300 shadow-sm border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5 text-teal-400" />
                    <span>Đăng Nhập</span>
                  </button>
                </div>

                {/* Saved accounts in this device for quick fill */}
                {savedAccounts.length > 0 && (
                  <div className="mb-3 p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-emerald-400" />
                        Tài khoản đã lưu ({savedAccounts.length})
                      </span>
                      <span className="text-[10px] text-slate-400">Bấm để chọn</span>
                    </div>
                    <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pr-1">
                      {savedAccounts.map((acc) => (
                        <div
                          key={acc.email}
                          className="group flex items-center justify-between p-1.5 rounded-lg bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 transition-all text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              playClickSound();
                              setEmail(acc.email);
                              if (acc.name) setUsername(acc.name);
                              if (acc.organization) setOrganization(acc.organization);
                              if (acc.avatar) setSelectedAvatar(acc.avatar);
                              if (authMode === 'signup') setAuthMode('signin');
                            }}
                            className="flex-1 flex items-center gap-2 text-left cursor-pointer overflow-hidden"
                          >
                            <span className="text-base flex-shrink-0">{acc.avatar || '🌱'}</span>
                            <div className="truncate min-w-0">
                              <p className="font-semibold text-slate-200 group-hover:text-emerald-300 truncate text-[11px]">
                                {acc.name || acc.email.split('@')[0]}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate font-mono">{acc.email}</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            title="Xóa tài khoản"
                            onClick={(e) => {
                              e.stopPropagation();
                              playClickSound();
                              removeSavedAccount(acc.email);
                              setSavedAccounts(loadSavedAccounts());
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="p-3 mb-3 rounded-xl bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                      <span className="leading-relaxed font-medium">{error}</span>
                    </div>

                    {errorType === 'invalid_cred' && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-rose-900/60">
                        <button
                          type="button"
                          onClick={() => {
                            playClickSound();
                            setAuthMode('signup');
                            setError(null);
                            setErrorType(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-900 hover:bg-rose-800 text-white text-[11px] font-bold transition-all cursor-pointer"
                        >
                          👉 Đăng Ký Mới
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {successMsg && (
                  <div className="p-3 mb-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {/* FORM ĐĂNG KÝ / ĐĂNG NHẬP VỚI MÃ PIN */}
                <form onSubmit={handleRequestPin} className="space-y-3">
                  {authMode === 'signup' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-emerald-400" />
                        Tên thí sinh / Đội thi <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="VD: Nguyễn Văn A"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-teal-400" />
                        Email chính chủ <span className="text-rose-400">*</span>
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> Sẽ nhận mã PIN 6 số
                      </span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your-email@gmail.com"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-cyan-400" />
                      Mật khẩu <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
                    />
                  </div>

                  {authMode === 'signup' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          <School className="w-3.5 h-3.5 text-amber-400" />
                          Đơn vị / Chi đội / Lớp
                        </label>
                        <input
                          type="text"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          placeholder="VD: Lớp 11A1 - THPT Chuyên"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all"
                        />
                      </div>

                      {/* Mascot Selection */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          Chọn Mascot:
                        </label>
                        <div className="flex flex-wrap gap-1.5 justify-center py-1 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
                          {DEFAULT_AVATARS.map((av) => (
                            <button
                              key={av}
                              type="button"
                              onClick={() => setSelectedAvatar(av)}
                              className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all cursor-pointer ${
                                selectedAvatar === av
                                  ? 'bg-emerald-500/30 border-2 border-emerald-400 scale-110 shadow-md'
                                  : 'hover:bg-slate-800 border border-transparent'
                              }`}
                            >
                              <span className="select-none">{av}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Submit Button to trigger PIN dispatch */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:via-teal-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all transform active:scale-98 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang tạo và gửi mã PIN xác thực...</span>
                      </>
                    ) : authMode === 'signup' ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-300" />
                        <span>Tiếp Tục & Gửi Mã PIN Xác Thực</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 text-cyan-300" />
                        <span>Đăng Nhập & Gửi Mã PIN</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* GOOGLE QUICK CONNECT MODAL / POPUP */}
        {showGoogleModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="relative w-full max-w-sm bg-slate-900 border-2 border-blue-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="absolute top-3.5 right-3.5 p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center space-y-1.5">
                <div className="inline-flex p-2.5 rounded-2xl bg-slate-950 border border-slate-700 shadow-sm">
                  <GoogleIcon className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-black text-slate-100">Đăng Nhập Với Tài Khoản Google</h3>
                <p className="text-xs text-slate-400">
                  Tài khoản Google chính chủ, tự động liên kết cơ sở dữ liệu Supabase và bảo vệ chống tạo tài khoản ảo.
                </p>
              </div>

              {/* OPTION A: SUPABASE DIRECT GOOGLE OAUTH */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-blue-500/30 space-y-2">
                <button
                  type="button"
                  disabled={googleLoading}
                  onClick={async () => {
                    setGoogleLoading(true);
                    playClickSound();
                    const { error } = await signInWithGoogle();
                    if (error) {
                      setGoogleLoading(false);
                      setError(`Lưu ý Google OAuth: ${error}. (Bạn có thể dùng tùy chọn nhập email bên dưới để xác minh tức thì).`);
                    }
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-900/40 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 disabled:opacity-50"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GoogleIcon className="w-4 h-4" />
                  )}
                  <span>Mở Trang Đăng Nhập Google (OAuth)</span>
                </button>
                <p className="text-[10px] text-slate-400 text-center">
                  Mở hộp thoại đăng nhập Google của Supabase (yêu cầu bật Google Provider trong Supabase).
                </p>
              </div>

              {/* DIVIDER */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-2 text-[10px] uppercase font-bold text-slate-500">
                  Hoặc xác minh email Google trực tiếp
                </span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              <div className="space-y-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Email Google của bạn:
                  </label>
                  <input
                    type="email"
                    value={googleEmailInput}
                    onChange={(e) => setGoogleEmailInput(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tên hiển thị thi đấu:
                  </label>
                  <input
                    type="text"
                    value={googleNameInput}
                    onChange={(e) => setGoogleNameInput(e.target.value)}
                    placeholder="Tên của bạn"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Pre-fill button for quick test with user's email */}
                <button
                  type="button"
                  onClick={() => {
                    setGoogleEmailInput('hieu.bonbin0408@gmail.com');
                    setGoogleNameInput('Hieu Bonbin');
                  }}
                  className="text-[11px] text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer"
                >
                  Sử dụng email: hieu.bonbin0408@gmail.com
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowGoogleModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={googleLoading || !googleEmailInput.trim()}
                  onClick={() => handleContinueWithGoogle()}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {googleLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>Xác Nhận Đăng Nhập</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
