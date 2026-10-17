'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { auth, clearSession } from '@/edu/utils/api';
import { PasswordFields, passwordIssue } from '@/edu/components/PasswordFields';

// E-poçtdakı bərpa linki: yeni parol burada təyin olunur.
function ResetPassword() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [state, setState] = useState<'checking' | 'ready' | 'bad' | 'done'>('checking');
  const [who, setWho] = useState({ name: '', email: '' });
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Link natamamdır');
      setState('bad');
      return;
    }
    auth
      .verifyReset(token)
      .then((r) => {
        setWho({ name: r.name, email: r.email });
        setState('ready');
      })
      .catch((e: any) => {
        setError(e?.message || 'Link etibarsızdır');
        setState('bad');
      });
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = passwordIssue(pw, pw2);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await auth.resetPassword(token, pw);
      clearSession();
      setState('done');
      setTimeout(() => router.push('/login'), 1800);
    } catch (e: any) {
      setError(e?.message || 'Parol saxlanmadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#4F46E5] flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Yeni parol</h1>
          {who.email && <p className="text-sm text-[#64748B] mt-1">{who.name} · {who.email}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm">
          {state === 'checking' && <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5] mx-auto" />}
          {state === 'bad' && (
            <div className="text-center">
              <AlertCircle className="w-10 h-10 text-[#94A3B8] mx-auto mb-3" />
              <p className="text-sm text-[#B91C1C]">{error}</p>
              <Link href="/forgot-password" className="inline-block mt-3 text-sm font-medium text-[#4F46E5]">Yeni link istəyin</Link>
            </div>
          )}
          {state === 'done' && (
            <div className="text-center">
              <CheckCircle2 className="w-10 h-10 text-[#16A34A] mx-auto mb-3" />
              <p className="text-sm text-[#0F172A]">Parol dəyişdirildi. Digər cihazlardakı sessiyalar bağlandı. Giriş səhifəsinə keçirsiniz…</p>
            </div>
          )}
          {state === 'ready' && (
            <form onSubmit={submit} className="space-y-4">
              <PasswordFields pw={pw} pw2={pw2} setPw={setPw} setPw2={setPw2} />
              {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
              <button disabled={busy} className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white text-sm font-semibold hover:bg-[#4338CA] disabled:opacity-60 flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Parolu saxla
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}
