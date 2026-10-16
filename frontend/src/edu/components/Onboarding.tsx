'use client';

import { useEffect, useState } from 'react';
import { GraduationCap, BookOpenCheck, Heart, ShieldCheck, Copy, Check, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth, saveSession, EduUser } from '../utils/api';
import { T, ROLE_COLOR } from '../theme';

const ROLES = [
  { key: 'student', title: 'Şagirdəm', sub: 'Dərsləri, tapşırıqları və qiymətləri izləyirəm', Icon: GraduationCap },
  { key: 'teacher', title: 'Müəlliməm', sub: 'Dərs keçirir, davamiyyət və imtahanları idarə edirəm', Icon: BookOpenCheck },
  { key: 'guardian', title: 'Valideynəm', sub: 'Övladımın irəliləyişini izləyirəm', Icon: Heart },
  { key: 'admin', title: 'Adminəm', sub: 'Mərkəzi idarə edirəm, insanları kodla əlavə edirəm', Icon: ShieldCheck },
];

export default function Onboarding({ user, onUser, onLogout }: { user: EduUser; onUser: (u: EduUser) => void; onLogout: () => void }) {
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const needsRole = !user.role;

  // Gözləmə ekranı: admin əlavə edəndə avtomatik açılır
  useEffect(() => {
    if (needsRole) return;
    const t = setInterval(async () => {
      try {
        const fresh: any = await auth.me();
        if (fresh.token) saveSession(fresh.token, fresh);
        if (fresh.status === 'active') {
          const { token, ...u } = fresh;
          localStorage.setItem('edu_user', JSON.stringify(u));
          onUser(u as EduUser);
        }
      } catch (e) {}
    }, 4000);
    return () => clearInterval(t);
  }, [needsRole, onUser]);

  const choose = async (role: string) => {
    setBusy(role);
    try {
      const r = await auth.chooseRole(role);
      saveSession(r.token, r.user);
      onUser(r.user);
      if (r.user.status === 'active') toast.success('Xoş gəldiniz! Siz bu mərkəzin ilk adminisiniz.');
    } catch (e: any) {
      toast.error(e?.message || 'Xəta');
    } finally {
      setBusy('');
    }
  };

  const code = user.code || '------';
  const copy = () => {
    try {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {}
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: T.bg }}>
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <p className="text-sm" style={{ color: T.inkSoft }}>Salam, {user.name}</p>
          <h1 className="text-2xl font-semibold mt-1" style={{ color: T.ink }}>
            {needsRole ? 'Siz kimsiniz?' : 'Demək olar hazırdır'}
          </h1>
        </div>

        {needsRole ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {ROLES.map(({ key, title, sub, Icon }) => {
              const rc = ROLE_COLOR[key];
              return (
                <button
                  key={key}
                  disabled={!!busy}
                  onClick={() => choose(key)}
                  className="text-left p-5 rounded-2xl border bg-white transition hover:shadow-sm disabled:opacity-60"
                  style={{ borderColor: T.line }}
                >
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: rc.soft, color: rc.color }}>
                    {busy === key ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
                  </span>
                  <p className="font-semibold" style={{ color: T.ink }}>{title}</p>
                  <p className="text-xs mt-1" style={{ color: T.inkSoft }}>{sub}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: T.line }}>
            <p className="text-sm" style={{ color: T.inkSoft }}>
              Bu kodu mərkəzin adminə verin. O, kodu daxil edən kimi sizi sistemə əlavə edəcək.
            </p>
            <button onClick={copy} className="mt-5 inline-flex items-center gap-3 px-6 py-4 rounded-2xl" style={{ background: T.accentSoft }}>
              <span className="text-4xl font-semibold tracking-[0.25em] tabular-nums" style={{ color: T.accent }}>
                {code.slice(0, 3)} {code.slice(3)}
              </span>
              {copied ? <Check className="w-5 h-5" style={{ color: T.ok }} /> : <Copy className="w-5 h-5" style={{ color: T.accent }} />}
            </button>
            <p className="text-xs mt-5 flex items-center justify-center gap-2" style={{ color: T.inkFaint }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Admin əlavə edənə qədər gözlənilir — səhifə avtomatik açılacaq
            </p>
          </div>
        )}

        <button onClick={onLogout} className="mx-auto mt-6 flex items-center gap-2 text-sm" style={{ color: T.inkSoft }}>
          <LogOut className="w-4 h-4" /> Çıxış
        </button>
      </div>
    </div>
  );
}
