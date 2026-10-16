'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { auth, saveSession, getToken } from '@/edu/utils/api';
import AuthPortal from '@/edu/components/AuthPortal';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [centre, setCentre] = useState('');
  const [missing, setMissing] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (getToken()) {
      router.push('/dashboard');
      return;
    }
    auth
      .tenant()
      .then((t) => setCentre(t.name || ''))
      .catch((e: any) => setMissing(e?.message || 'Bu ünvanda mərkəz yoxdur'))
      .finally(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await auth.login(email.trim(), password);
      saveSession(data.token, data.user);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Giriş alınmadı');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
      </div>
    );
  }

  if (missing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6">
        <div className="max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-[#94A3B8] mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[#0F172A] mb-2">{missing}</h1>
          <p className="text-sm text-[#64748B]">Ünvanı yoxlayın və ya mərkəzin administrasiyası ilə əlaqə saxlayın.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#4F46E5] flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">{centre || 'Təlim mərkəzi'}</h1>
          <p className="text-sm text-[#64748B] mt-1">Hesabınıza daxil olun</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">E-poçt</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
                  placeholder="ad@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">Şifrə</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-[#DC2626] mt-0.5 shrink-0" />
                <p className="text-sm text-[#B91C1C]">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white text-sm font-semibold hover:bg-[#4338CA] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Yoxlanılır...' : 'Daxil ol'}
            </button>
          </form>
        </div>

        <AuthPortal />

        <p className="text-center text-xs text-[#94A3B8] mt-6">
          Giriş məlumatlarınızı mərkəzin administrasiyası verir.
        </p>
      </div>
    </div>
  );
}
