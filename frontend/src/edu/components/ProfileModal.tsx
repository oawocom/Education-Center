'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, LogOut, Mail, ShieldCheck, User } from 'lucide-react';
import { auth, EduUser, saveSession, getToken } from '../utils/api';
import { Modal } from './ui';
import { PasswordFields, passwordIssue } from './PasswordFields';
import { T } from '../theme';

// ============================================================
// Profil: ad, telefon, e-poçt bildirişləri; parolun dəyişdirilməsi;
// bütün cihazlardan çıxış.
// ============================================================

const inp =
  'w-full px-3 py-2 rounded-xl border border-[#E8E5DE] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2F5BEA]/25 focus:border-[#2F5BEA] disabled:bg-[#FAF9F6] disabled:text-[#9AA3B2]';

export default function ProfileModal({
  user, color, onClose, onUser,
}: { user: EduUser; color: string; onClose: () => void; onUser: (u: EduUser) => void }) {
  const [tab, setTab] = useState<'profile' | 'security'>('profile');
  const [name, setName] = useState(user.name || '');
  const [display, setDisplay] = useState(user.display_name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [notify, setNotify] = useState(user.email_notifications !== false);
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');

  const keep = (u: EduUser, token?: string) => {
    saveSession(token || getToken(), u);
    onUser(u);
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      setErr('Ad boş ola bilməz');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const u = await auth.updateProfile({ name: name.trim(), display_name: display.trim(), phone: phone.trim(), email_notifications: notify });
      keep(u);
      toast.success('Profil saxlandı');
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Saxlanmadı');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    const issue = passwordIssue(pw, pw2);
    if (!cur) {
      setErr('Cari parolu yazın');
      return;
    }
    if (issue) {
      setErr(issue);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await auth.changePassword(cur, pw);
      keep(user, r.token);
      setCur('');
      setPw('');
      setPw2('');
      toast.success('Parol dəyişdirildi', { description: 'Digər cihazlardakı sessiyalar bağlandı.' });
    } catch (e: any) {
      setErr(e?.message || 'Parol dəyişmədi');
    } finally {
      setBusy(false);
    }
  };

  const logoutAll = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await auth.logoutAll();
      keep(user, r.token);
      toast.success('Digər bütün cihazlardan çıxış edildi');
    } catch (e: any) {
      setErr(e?.message || 'Alınmadı');
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (id: 'profile' | 'security', label: string, Icon: any) => (
    <button
      onClick={() => { setTab(id); setErr(''); }}
      className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg"
      style={tab === id ? { background: T.lineSoft, color: T.ink, fontWeight: 600 } : { color: T.inkSoft }}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <Modal
      open
      title="Profilim"
      onClose={onClose}
      footer={
        tab === 'profile' ? (
          <button
            disabled={busy}
            onClick={saveProfile}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 inline-flex items-center gap-2"
            style={{ background: color }}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Saxla
          </button>
        ) : undefined
      }
    >
      <div className="flex gap-1 mb-4">
        {tabBtn('profile', 'Profil', User)}
        {tabBtn('security', 'Təhlükəsizlik', ShieldCheck)}
      </div>
      {err && <p className="mb-3 text-sm px-3 py-2 rounded-lg" style={{ background: T.badSoft, color: T.bad }}>{err}</p>}

      {tab === 'profile' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold mb-1.5">Ad və soyad</label>
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">Görünən ad <span className="font-normal" style={{ color: T.inkFaint }}>(istəyə görə)</span></label>
            <input className={inp} value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="məs. Aynur müəllim" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">Telefon</label>
            <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+994 …" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">E-poçt</label>
            <input className={inp} value={user.email} disabled />
            <p className="text-xs mt-1" style={{ color: T.inkFaint }}>E-poçtu mərkəzin administrasiyası dəyişə bilər.</p>
          </div>
          <label className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer" style={{ borderColor: T.line }}>
            <input type="checkbox" className="mt-1" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold"><Mail className="w-4 h-4" /> Bildirişlər e-poçtla da gəlsin</span>
              <span className="block text-xs mt-0.5" style={{ color: T.inkSoft }}>
                Yeni ismarıc, elan, qaimə, imtahan nəticəsi və s. Parol və təhlükəsizlik məktubları həmişə gəlir.
              </span>
            </span>
          </label>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-semibold">Parolu dəyiş</p>
            {user.provider === 'google' && (
              <p className="text-xs" style={{ color: T.inkSoft }}>
                Google ilə daxil olursunuzsa və parolunuz yoxdursa, çıxış edib giriş səhifəsində &quot;Parolu unutmusunuz?&quot; ilə parol təyin edin.
              </p>
            )}
            <input className={inp} type="password" placeholder="Cari parol" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
            <PasswordFields pw={pw} pw2={pw2} setPw={setPw} setPw2={setPw2} />
            <button
              disabled={busy}
              onClick={changePassword}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 inline-flex items-center gap-2"
              style={{ background: color }}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Parolu dəyiş
            </button>
            <p className="text-xs" style={{ color: T.inkFaint }}>Parol dəyişəndə digər cihazlardakı sessiyalar bağlanır.</p>
          </div>
          <div className="pt-4 border-t" style={{ borderColor: T.lineSoft }}>
            <p className="text-sm font-semibold">Bütün cihazlardan çıx</p>
            <p className="text-xs mt-1 mb-3" style={{ color: T.inkSoft }}>Telefonunuzu itirmisinizsə və ya başqa kompüterdə çıxışı unutmusunuzsa. Bu cihaz girişdə qalır.</p>
            <button
              disabled={busy}
              onClick={logoutAll}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold border inline-flex items-center gap-2 disabled:opacity-60"
              style={{ borderColor: '#FECACA', color: T.bad }}
            >
              <LogOut className="w-4 h-4" /> Digər cihazlardan çıx
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
