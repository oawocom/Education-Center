'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { auth, saveSession } from '../utils/api';
import { T } from '../theme';

// ============================================================
// Giriş səhifəsinin altında: "Qeydiyyat" + "Google ilə davam et".
// ============================================================

export default function AuthPortal() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [gid, setGid] = useState('');
  const gref = useRef<HTMLDivElement>(null);
  const enter = (token: string, user: any) => {
    saveSession(token, user);
    window.location.href = '/dashboard';
  };

  useEffect(() => {
    auth.config().then((c) => setGid(c.google_client_id || '')).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gid || !gref.current) return;
    const init = () => {
      const g = (window as any).google;
      if (!g || !gref.current) return;
      g.accounts.id.initialize({
        client_id: gid,
        callback: async (resp: any) => {
          try {
            const r = await auth.google(resp.credential);
            enter(r.token, r.user);
          } catch (e: any) {
            setErr(e?.message || 'Google ilə giriş alınmadı');
          }
        },
      });
      g.accounts.id.renderButton(gref.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with', locale: 'az' });
    };
    if ((window as any).google?.accounts) return init();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [gid]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await auth.register(name, email, pw);
      enter(r.token, r.user);
    } catch (e: any) {
      setErr(e?.message || 'Qeydiyyat alınmadı');
    } finally {
      setBusy(false);
    }
  };

  const inp = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2';
  return (
    <div
      style={{
        display: 'flex', justifyContent: 'center',
        ...(open
          ? { position: 'fixed', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, alignItems: 'center', background: 'rgba(28,36,52,.35)', padding: 16 }
          : { marginTop: 20 }),
      }}
    >
     <div style={{ width: '100%', maxWidth: 380, pointerEvents: 'auto' }}>
      <div className="text-center">
        <div ref={gref} style={{ display: 'flex', justifyContent: 'center', minHeight: gid ? 44 : 0 }} />
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl border bg-white"
            style={{ borderColor: T.line, color: T.ink }}
          >
            <UserPlus className="w-4 h-4" /> Hesabınız yoxdur? Qeydiyyatdan keçin
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="mt-3 p-5 rounded-2xl border bg-white flex flex-col gap-3" style={{ borderColor: T.line }}>
          <div className="flex items-center justify-between">
            <p className="font-semibold" style={{ color: T.ink }}>Qeydiyyat</p>
            <button type="button" onClick={() => setOpen(false)}><X className="w-4 h-4" style={{ color: T.inkFaint }} /></button>
          </div>
          {err && <p className="text-sm px-3 py-2 rounded-lg" style={{ background: T.badSoft, color: T.bad }}>{err}</p>}
          <input className={inp} style={{ borderColor: T.line }} placeholder="Ad və soyad" required value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inp} style={{ borderColor: T.line }} type="email" placeholder="E-poçt" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={inp} style={{ borderColor: T.line }} type="password" minLength={6} placeholder="Parol (min. 6 simvol)" required value={pw} onChange={(e) => setPw(e.target.value)} />
          <button disabled={busy} className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-semibold disabled:opacity-60" style={{ background: T.accent }}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Qeydiyyatdan keç
          </button>
          <p className="text-xs text-center" style={{ color: T.inkFaint }}>Növbəti addımda rolunuzu seçəcəksiniz.</p>
        </form>
      )}
     </div>
    </div>
  );
}
