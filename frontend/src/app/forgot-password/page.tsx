'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2, Mail, MailCheck } from 'lucide-react';
import { auth } from '@/edu/utils/api';

// "Parolu unutmusunuz?" — e-poçta bir dəfəlik bərpa linki göndərilir.
export default function ForgotPasswordPage() {
  const [centre, setCentre] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<null | { ready: boolean }>(null);

  useEffect(() => {
    auth.tenant().then((t) => setCentre(t.name || '')).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await auth.forgotPassword(email.trim());
      setSent({ ready: r.mail_ready });
    } catch (e: any) {
      setError(e?.message || 'Sorğu göndərilmədi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#4F46E5] flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Parolun bərpası</h1>
          <p className="text-sm text-[#64748B] mt-1">{centre ? centre + ' · ' : ''}e-poçtunuza link göndərəcəyik</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm">
          {sent ? (
            sent.ready ? (
              <div className="text-center">
                <MailCheck className="w-10 h-10 text-[#16A34A] mx-auto mb-3" />
                <p className="text-sm text-[#0F172A] font-semibold">Məktubu yoxlayın</p>
                <p className="text-sm text-[#64748B] mt-2">
                  <b>{email.trim()}</b> ünvanı ilə hesab varsa, ona parolu bərpa etmək üçün link göndərildi. Link 60 dəqiqə etibarlıdır.
                  Məktub gəlməsə, &quot;Spam&quot; qovluğuna baxın.
                </p>
              </div>
            ) : (
              <div className="text-center">
                <AlertCircle className="w-10 h-10 text-[#D97706] mx-auto mb-3" />
                <p className="text-sm text-[#0F172A] font-semibold">Bu mərkəzdə e-poçt göndərmə hələ qurulmayıb</p>
                <p className="text-sm text-[#64748B] mt-2">Parolu yeniləmək üçün mərkəzin administrasiyası ilə əlaqə saxlayın.</p>
              </div>
            )
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">E-poçt</label>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ad@example.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
                />
              </div>
              {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
              <button disabled={busy} className="w-full py-2.5 rounded-xl bg-[#4F46E5] text-white text-sm font-semibold hover:bg-[#4338CA] disabled:opacity-60 flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Bərpa linkini göndər
              </button>
            </form>
          )}
        </div>

        <Link href="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-[#4F46E5] font-medium">
          <ArrowLeft className="w-4 h-4" /> Girişə qayıt
        </Link>
      </div>
    </div>
  );
}
