'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { auth } from '@/edu/utils/api';

// The link an admin hands a new user: the user chooses the password here.
function SetupPassword() {
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
      .verifySetupToken(token)
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
    if (pw !== pw2) {
      setError('Parollar eyni deyil');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await auth.setupPassword(token, pw);
      setState('done');
      setTimeout(() => router.push('/login'), 1500);
    } catch (e: any) {
      setError(e?.message || 'Parol saxlanmadı');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#4F46E5] flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Parol təyin edin</h1>
          {who.email && <p className="text-sm text-[#64748B] mt-1">{who.name} · {who.email}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm">
          {state === 'checking' && <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5] mx-auto" />}
          {state === 'bad' && (
            <div className="text-center">
              <AlertCircle className="w-10 h-10 text-[#94A3B8] mx-auto mb-3" />
              <p className="text-sm text-[#B91C1C]">{error}</p>
              <p className="text-xs text-[#64748B] mt-2">Administrasiyadan yeni link istəyin.</p>
            </div>
          )}
          {state === 'done' && (
            <div className="text-center">
              <CheckCircle2 className="w-10 h-10 text-[#16A34A] mx-auto mb-3" />
              <p className="text-sm text-[#0F172A]">Parol saxlandı. Giriş səhifəsinə keçirsiniz…</p>
            </div>
          )}
          {state === 'ready' && (
            <form onSubmit={submit} className="space-y-4">
              <input className={input} type="password" minLength={6} required placeholder="Yeni parol (min. 6 simvol)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <input className={input} type="password" minLength={6} required placeholder="Parolu təkrarlayın" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
              {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
              <button disabled={busy} className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white text-sm font-semibold hover:bg-[#4338CA] disabled:opacity-60 flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Saxla
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetupPassword />
    </Suspense>
  );
}
