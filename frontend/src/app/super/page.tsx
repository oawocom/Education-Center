'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2, KeyRound, Loader2, LogOut, Pencil, Plus, ShieldCheck, UserPlus, X, Mail, Users, ScrollText, Search, Send, Trash2,
} from 'lucide-react';

// ============================================================
// Super admin paneli: mərkəzləri yaratmaq və idarə etmək.
// Hər mərkəzin öz bazası və öz ünvanları (domenləri) var.
// ============================================================

const K_TOKEN = 'super_token';

interface Tenant {
  id: number;
  name: string;
  db_name: string;
  is_active: boolean;
  created_at: string;
  domains: { host: string }[];
  counts?: Record<string, number>;
  error?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_from?: string;
  smtp_from_name?: string;
  smtp_password_set?: boolean;
  mail_source?: 'own' | 'server' | 'none';
}

interface CentreUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  is_active: boolean;
  last_login?: string;
  created_at: string;
}

const ROLE_AZ: Record<string, string> = { admin: 'Admin', teacher: 'Müəllim', student: 'Şagird', guardian: 'Valideyn', '': 'Rol seçilməyib' };

const MAIL_BADGE: Record<string, { label: string; cls: string }> = {
  own: { label: 'E-poçt: öz SMTP', cls: 'bg-[#DCFCE7] text-[#166534]' },
  server: { label: 'E-poçt: serverin SMTP-si', cls: 'bg-[#E0E7FF] text-[#3730A3]' },
  none: { label: 'E-poçt qurulmayıb', cls: 'bg-[#FEF3C7] text-[#92400E]' },
};

function token(): string {
  try {
    return localStorage.getItem(K_TOKEN) || '';
  } catch (e) {
    return '';
  }
}

async function call(path: string, method = 'GET', body?: any): Promise<any> {
  const res = await fetch('/api/super' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    try {
      localStorage.removeItem(K_TOKEN);
    } catch (e) {}
    window.location.reload();
  }
  if (!res.ok) throw new Error(data.error || 'Xəta baş verdi');
  return data;
}

const input =
  'w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]';
const primary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4F46E5] text-white text-sm font-semibold hover:bg-[#4338CA] disabled:opacity-60';
const ghost =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#334155] hover:bg-[#F1F5F9]';

const hosts = (text: string) => text.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,.4)] p-4" onClick={onClose}>
      <div className={'w-full bg-white rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto ' + (wide ? 'max-w-4xl' : 'max-w-md')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-[#0F172A]">{title}</h2>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A]">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[#475569] mb-1">{label}</span>
      {children}
    </label>
  );
}

function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await call('/login', 'POST', { email, password });
      localStorage.setItem(K_TOKEN, r.token);
      onIn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#0F172A] flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-extrabold text-[#0F172A]">Super admin</h1>
        </div>
        <input className={input} type="email" required placeholder="E-poçt" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input className={input} type="password" required placeholder="Parol" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
        <button disabled={busy} className={primary + ' w-full'}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Daxil ol
        </button>
      </form>
    </div>
  );
}

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; t: Tenant }
  | { kind: 'password'; t: Tenant }
  | { kind: 'admin'; t: Tenant }
  | { kind: 'mail'; t: Tenant }
  | { kind: 'users'; t: Tenant }
  | { kind: 'log'; t: Tenant }
  | { kind: 'own' }
  | null;

function Panel({ onOut }: { onOut: () => void }) {
  const [tab, setTab] = useState<'centres' | 'admins'>('centres');
  const [me, setMe] = useState<{ id: number; email: string } | null>(null);
  const [list, setList] = useState<Tenant[] | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, any>>({});
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const load = useCallback(() => {
    call('/tenants')
      .then((r) => setList(r.data))
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    call('/me').then(setMe).catch(() => {});
  }, []);

  const open = (d: Dialog) => {
    setDialog(d);
    if (d && d.kind === 'edit') setF({ name: d.t.name, domains: d.t.domains.map((x) => x.host).join('\n'), is_active: d.t.is_active });
    else if (d && d.kind === 'mail')
      setF({ host: d.t.smtp_host || '', port: d.t.smtp_port || '587', user: d.t.smtp_user || '', password: '', from: d.t.smtp_from || '', from_name: d.t.smtp_from_name || '', to: me?.email || '' });
    else setF({});
  };

  const totals = (list || []).reduce(
    (a, t) => {
      a.centres++;
      if (t.is_active) a.active++;
      a.users += t.counts?.users || 0;
      a.teachers += t.counts?.teachers || 0;
      a.students += t.counts?.students || 0;
      if (t.mail_source === 'none') a.noMail++;
      return a;
    },
    { centres: 0, active: 0, users: 0, teachers: 0, students: 0, noMail: 0 },
  );

  const saveMail = (clear?: boolean) => {
    if (!dialog || dialog.kind !== 'mail') return;
    const t = dialog.t;
    const mail = clear
      ? { host: '', port: '', user: '', password: '', from: '', from_name: '' }
      : { host: f.host, port: f.port, user: f.user, password: f.password, from: f.from, from_name: f.from_name };
    run(
      () => call('/tenants/' + t.id, 'PUT', { name: t.name, is_active: t.is_active, domains: t.domains.map((d) => d.host), mail }),
      clear ? 'Mərkəzin SMTP-si silindi' : 'E-poçt ayarları saxlanıldı',
    );
  };

  const testMail = async () => {
    if (!dialog || dialog.kind !== 'mail') return;
    setBusy(true);
    try {
      const r = await call('/tenants/' + dialog.t.id + '/test-mail', 'POST', { to: f.to });
      toast.success('Sınaq məktubu göndərildi', { description: r.to });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<any>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setDialog(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialog) return;
    if (dialog.kind === 'create')
      run(
        () => call('/tenants', 'POST', { name: f.name, domains: hosts(f.domains || ''), admin: { name: f.admin_name, email: f.admin_email, password: f.admin_password } }),
        'Mərkəz yaradıldı',
      );
    if (dialog.kind === 'edit')
      run(() => call('/tenants/' + dialog.t.id, 'PUT', { name: f.name, is_active: !!f.is_active, domains: hosts(f.domains || '') }), 'Saxlanıldı');
    if (dialog.kind === 'password')
      run(() => call('/tenants/' + dialog.t.id + '/password', 'POST', { email: f.email, password: f.password }), 'Parol dəyişdirildi');
    if (dialog.kind === 'admin')
      run(() => call('/tenants/' + dialog.t.id + '/admin', 'POST', { name: f.admin_name, email: f.admin_email, password: f.admin_password }), 'Admin yaradıldı');
    if (dialog.kind === 'own')
      run(() => call('/password', 'POST', { current_password: f.current, new_password: f.next }), 'Parolunuz dəyişdirildi');
    if (dialog.kind === 'mail') saveMail();
  };

  const adminFields = (
    <>
      <Field label="Adminin adı">
        <input className={input} required value={f.admin_name || ''} onChange={set('admin_name')} />
      </Field>
      <Field label="Adminin e-poçtu">
        <input className={input} type="email" required value={f.admin_email || ''} onChange={set('admin_email')} />
      </Field>
      <Field label="Adminin parolu (ən azı 8 simvol)">
        <input className={input} type="password" minLength={8} required value={f.admin_password || ''} onChange={set('admin_password')} autoComplete="new-password" />
      </Field>
    </>
  );

  const domainsField = (
    <Field label="Domenlər (hər sətirdə bir; məs. core.az, www.core.az)">
      <textarea className={input + ' min-h-[80px]'} required value={f.domains || ''} onChange={set('domains')} placeholder="core.az" />
    </Field>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-[#0F172A]">
            <ShieldCheck className="w-5 h-5 text-[#4F46E5]" /> Super admin
          </div>
          <nav className="flex items-center gap-1">
            {(
              [
                ['centres', 'Mərkəzlər'],
                ['admins', 'Super adminlər'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={'px-3 py-1.5 rounded-lg text-sm ' + (tab === k ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold' : 'text-[#475569]')}
              >
                {l}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button className={ghost} onClick={() => open({ kind: 'own' })}>
              <KeyRound className="w-3.5 h-3.5" /> Parolum
            </button>
            <button className={ghost} onClick={onOut}>
              <LogOut className="w-3.5 h-3.5" /> Çıxış
            </button>
          </div>
        </div>
      </header>

      {tab === 'admins' && <SuperAdmins me={me} />}

      {tab === 'centres' && (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {list && list.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              ['Mərkəz', totals.centres, totals.active + ' aktiv'],
              ['Hesab', totals.users, ''],
              ['Müəllim', totals.teachers, ''],
              ['Şagird', totals.students, ''],
              ['E-poçtsuz', totals.noMail, 'SMTP qurulmayıb'],
            ].map(([l, n, sub]) => (
              <div key={String(l)} className="bg-white rounded-2xl border border-[#E2E8F0] px-4 py-3">
                <div className="text-2xl font-extrabold text-[#0F172A]">{n}</div>
                <div className="text-xs text-[#64748B]">{l}{sub ? ' · ' + sub : ''}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0F172A]">Mərkəzlər</h1>
            <p className="text-sm text-[#64748B]">Hər mərkəz öz domenində açılır, məlumatı öz bazasında saxlanılır.</p>
          </div>
          <button className={primary} onClick={() => open({ kind: 'create' })}>
            <Plus className="w-4 h-4" /> Yeni mərkəz
          </button>
        </div>

        {!list && <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" />}
        {list && list.length === 0 && (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-10 text-center text-sm text-[#64748B]">Hələ mərkəz yoxdur.</div>
        )}
        <div className="grid gap-4">
          {list?.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl border border-[#E2E8F0] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-[#4F46E5]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#0F172A]">{t.name}</span>
                      <span className={'text-[11px] font-semibold px-2 py-0.5 rounded-full ' + (t.is_active ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F1F5F9] text-[#64748B]')}>
                        {t.is_active ? 'Aktiv' : 'Dayandırılıb'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {t.domains.map((d) => (
                        <a key={d.host} href={'https://' + d.host} target="_blank" rel="noreferrer" className="text-sm text-[#4F46E5] hover:underline">
                          {d.host}
                        </a>
                      ))}
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-1 flex items-center gap-2 flex-wrap">
                      Baza: {t.db_name}
                      {t.mail_source && (
                        <span className={'text-[11px] font-semibold px-2 py-0.5 rounded-full ' + MAIL_BADGE[t.mail_source].cls}>{MAIL_BADGE[t.mail_source].label}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={ghost} onClick={() => open({ kind: 'edit', t })}>
                    <Pencil className="w-3.5 h-3.5" /> Dəyiş
                  </button>
                  <button className={ghost} onClick={() => open({ kind: 'mail', t })}>
                    <Mail className="w-3.5 h-3.5" /> E-poçt
                  </button>
                  {t.counts && (
                    <button className={ghost} onClick={() => open({ kind: 'users', t })}>
                      <Users className="w-3.5 h-3.5" /> İstifadəçilər
                    </button>
                  )}
                  {t.counts && (
                    <button className={ghost} onClick={() => open({ kind: 'log', t })}>
                      <ScrollText className="w-3.5 h-3.5" /> Jurnal
                    </button>
                  )}
                  <button className={ghost} onClick={() => open({ kind: 'password', t })}>
                    <KeyRound className="w-3.5 h-3.5" /> Parol
                  </button>
                  {t.counts && (
                    <button className={ghost} onClick={() => open({ kind: 'admin', t })}>
                      <UserPlus className="w-3.5 h-3.5" /> Admin əlavə et
                    </button>
                  )}
                </div>
              </div>
              {t.error && <p className="text-sm text-[#B91C1C] mt-3">{t.error}</p>}
              {t.counts && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4">
                  {[
                    ['users', 'Hesab'],
                    ['admins', 'Admin'],
                    ['branches', 'Filial'],
                    ['teachers', 'Müəllim'],
                    ['students', 'Şagird'],
                    ['groups', 'Qrup'],
                  ].map(([k, l]) => (
                    <div key={k} className="rounded-xl bg-[#F8FAFC] px-3 py-2">
                      <div className="text-lg font-bold text-[#0F172A]">{t.counts?.[k] ?? 0}</div>
                      <div className="text-[11px] text-[#64748B]">{l}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
      )}

      {dialog && dialog.kind === 'users' && <CentreUsers t={dialog.t} onClose={() => setDialog(null)} />}
      {dialog && dialog.kind === 'log' && <CentreLog t={dialog.t} onClose={() => setDialog(null)} />}

      {dialog && dialog.kind !== 'users' && dialog.kind !== 'log' && (
        <Modal
          title={
            dialog.kind === 'create'
              ? 'Yeni mərkəz'
              : dialog.kind === 'edit'
                ? dialog.t.name
                : dialog.kind === 'password'
                  ? 'İstifadəçiyə yeni parol — ' + dialog.t.name
                  : dialog.kind === 'admin'
                    ? 'Admin əlavə et — ' + dialog.t.name
                    : dialog.kind === 'mail'
                      ? 'E-poçt (SMTP) — ' + dialog.t.name
                      : 'Parolumu dəyiş'
          }
          onClose={() => setDialog(null)}
        >
          <form onSubmit={submit} className="space-y-3">
            {dialog.kind === 'create' && (
              <>
                <Field label="Mərkəzin adı">
                  <input className={input} required value={f.name || ''} onChange={set('name')} />
                </Field>
                {domainsField}
                <p className="text-xs text-[#64748B] pt-1">Mərkəzin ilk admini:</p>
                {adminFields}
              </>
            )}
            {dialog.kind === 'edit' && (
              <>
                <Field label="Mərkəzin adı">
                  <input className={input} required value={f.name || ''} onChange={set('name')} />
                </Field>
                {domainsField}
                <label className="flex items-center gap-2 text-sm text-[#0F172A]">
                  <input type="checkbox" checked={!!f.is_active} onChange={set('is_active')} /> Aktivdir (dayandırılsa heç kim daxil ola bilmir)
                </label>
              </>
            )}
            {dialog.kind === 'password' && (
              <>
                <Field label="İstifadəçinin e-poçtu">
                  <input className={input} type="email" required value={f.email || ''} onChange={set('email')} />
                </Field>
                <Field label="Yeni parol (ən azı 8 simvol)">
                  <input className={input} type="password" minLength={8} required value={f.password || ''} onChange={set('password')} autoComplete="new-password" />
                </Field>
                <p className="text-xs text-[#64748B]">İstifadəçinin bütün sessiyaları bağlanır. Daha yaxşısı: &quot;İstifadəçilər&quot; bölməsindən bərpa linki göndərin.</p>
              </>
            )}
            {dialog.kind === 'mail' && (
              <>
                <p className="text-xs text-[#64748B]">
                  Mərkəzin məktubları (dəvət, parol bərpası, bildirişlər) bu ayarla gedir. Boş qalsa, serverin ümumi SMTP-si işləyir (varsa).
                  Gmail üçün: smtp.gmail.com, port 587, istifadəçi — Gmail ünvanı, parol — &quot;App password&quot;.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Field label="SMTP server">
                      <input className={input} value={f.host || ''} onChange={set('host')} placeholder="smtp.gmail.com" />
                    </Field>
                  </div>
                  <Field label="Port">
                    <input className={input} value={f.port || ''} onChange={set('port')} placeholder="587" />
                  </Field>
                </div>
                <Field label="İstifadəçi">
                  <input className={input} value={f.user || ''} onChange={set('user')} autoComplete="off" />
                </Field>
                <Field label={dialog.t.smtp_password_set ? 'Parol (saxlanılıb — dəyişmək üçün yazın)' : 'Parol'}>
                  <input className={input} type="password" value={f.password || ''} onChange={set('password')} autoComplete="new-password" placeholder={dialog.t.smtp_password_set ? '••••••••' : ''} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Göndərən ünvan (From)">
                    <input className={input} type="email" value={f.from || ''} onChange={set('from')} placeholder="noreply@merkez.az" />
                  </Field>
                  <Field label="Göndərənin adı">
                    <input className={input} value={f.from_name || ''} onChange={set('from_name')} placeholder={dialog.t.name} />
                  </Field>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] p-3 space-y-2">
                  <p className="text-xs font-semibold text-[#475569]">Sınaq məktubu (saxlanmış ayarla gedir)</p>
                  <div className="flex gap-2">
                    <input className={input} type="email" value={f.to || ''} onChange={set('to')} placeholder="kimə" />
                    <button type="button" disabled={busy} onClick={testMail} className={ghost + ' shrink-0'}>
                      <Send className="w-3.5 h-3.5" /> Göndər
                    </button>
                  </div>
                </div>
                {dialog.t.smtp_host && (
                  <button type="button" disabled={busy} onClick={() => saveMail(true)} className="text-xs text-[#B91C1C] hover:underline">
                    Mərkəzin SMTP-sini sil (serverin ümumisinə qayıt)
                  </button>
                )}
              </>
            )}
            {dialog.kind === 'admin' && adminFields}
            {dialog.kind === 'own' && (
              <>
                <Field label="Cari parol">
                  <input className={input} type="password" required value={f.current || ''} onChange={set('current')} autoComplete="current-password" />
                </Field>
                <Field label="Yeni parol (min. 8 simvol)">
                  <input className={input} type="password" minLength={8} required value={f.next || ''} onChange={set('next')} autoComplete="new-password" />
                </Field>
              </>
            )}
            <button disabled={busy} className={primary + ' w-full mt-2'}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Saxla
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default function SuperPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => setSignedIn(!!token()), []);
  if (signedIn === null) return null;
  if (!signedIn) return <Login onIn={() => setSignedIn(true)} />;
  return (
    <Panel
      onOut={() => {
        try {
          localStorage.removeItem(K_TOKEN);
        } catch (e) {}
        setSignedIn(false);
      }}
    />
  );
}

// ============================================================
// Mərkəzin istifadəçiləri: axtarış, aktiv/deaktiv, bərpa linki
// ============================================================
function CentreUsers({ t, onClose }: { t: Tenant; onClose: () => void }) {
  const [rows, setRows] = useState<CentreUser[] | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(0);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (role) p.set('role', role);
    call('/tenants/' + t.id + '/users?' + p.toString())
      .then((r) => setRows(r.data || []))
      .catch((e) => toast.error(e.message));
  }, [t.id, q, role]);
  useEffect(() => {
    const x = setTimeout(load, 250);
    return () => clearTimeout(x);
  }, [load]);

  const act = async (u: CentreUser, fn: () => Promise<any>, done: string) => {
    setBusy(u.id);
    try {
      await fn();
      toast.success(done);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(0);
    }
  };

  return (
    <Modal title={'İstifadəçilər — ' + t.name} onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input className={input + ' pl-9'} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad və ya e-poçt…" />
        </div>
        <select className={input + ' w-auto'} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Bütün rollar</option>
          {['admin', 'teacher', 'student', 'guardian'].map((r) => <option key={r} value={r}>{ROLE_AZ[r]}</option>)}
        </select>
      </div>
      {!rows ? (
        <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#64748B] py-6 text-center">Tapılmadı</p>
      ) : (
        <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-left text-xs text-[#64748B]">
              <tr>
                <th className="px-3 py-2">Ad</th>
                <th className="px-3 py-2">E-poçt</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Son giriş</th>
                <th className="px-3 py-2">Vəziyyət</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-[#F1F5F9]">
                  <td className="px-3 py-2 font-medium text-[#0F172A]">{u.name}</td>
                  <td className="px-3 py-2 text-[#475569]">{u.email}</td>
                  <td className="px-3 py-2">{ROLE_AZ[u.role] ?? u.role}</td>
                  <td className="px-3 py-2 text-xs text-[#64748B] whitespace-nowrap">{u.last_login || '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        'text-[11px] font-semibold px-2 py-0.5 rounded-full ' +
                        (!u.is_active ? 'bg-[#F1F5F9] text-[#64748B]' : u.status === 'pending' ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#DCFCE7] text-[#166534]')
                      }
                    >
                      {!u.is_active ? 'Deaktiv' : u.status === 'pending' ? 'Gözləyir' : 'Aktiv'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      {u.is_active && (
                        <button
                          disabled={busy === u.id}
                          className={ghost}
                          onClick={() => act(u, () => call('/tenants/' + t.id + '/users/' + u.id + '/reset-link', 'POST'), 'Bərpa linki göndərildi: ' + u.email)}
                          title="Parolu bərpa etmək üçün e-poçta link (24 saat)"
                        >
                          <Send className="w-3.5 h-3.5" /> Bərpa linki
                        </button>
                      )}
                      <button
                        disabled={busy === u.id}
                        className={ghost}
                        onClick={() =>
                          act(u, () => call('/tenants/' + t.id + '/users/' + u.id, 'PUT', { is_active: !u.is_active }), u.is_active ? 'Deaktiv edildi' : 'Aktiv edildi')
                        }
                      >
                        {u.is_active ? 'Deaktiv et' : 'Aktiv et'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-[#94A3B8] mt-3">Deaktiv edilən hesabın bütün sessiyaları dərhal bağlanır. Ən çox 300 nəticə göstərilir — axtarışdan istifadə edin.</p>
    </Modal>
  );
}

// ============================================================
// Mərkəzin jurnalı: məktublar və audit
// ============================================================
const MAIL_STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Göndərildi', cls: 'bg-[#DCFCE7] text-[#166534]' },
  failed: { label: 'Alınmadı', cls: 'bg-[#FEE2E2] text-[#991B1B]' },
  skipped: { label: 'Göndərilmədi', cls: 'bg-[#FEF3C7] text-[#92400E]' },
};

const AUDIT_AZ: Record<string, string> = {
  login: 'Giriş', login_failed: 'Uğursuz giriş', registered: 'Qeydiyyat', password_reset_requested: 'Parol bərpası istəndi',
  password_reset: 'Parol bərpa edildi', password_changed: 'Parol dəyişdirildi', password_set: 'Parol təyin edildi',
  password_set_by_admin: 'Admin parol verdi', password_reset_sent: 'Bərpa linki göndərildi', logout_all: 'Bütün cihazlardan çıxış',
  user_created: 'Hesab yaradıldı', user_updated: 'Hesab dəyişdirildi', user_deleted: 'Hesab silindi',
  create: 'Yaradıldı', update: 'Dəyişdirildi', delete: 'Silindi', archive: 'Arxivə', restore: 'Arxivdən qaytarıldı',
  payment: 'Ödəniş qəbul edildi',
};

function CentreLog({ t, onClose }: { t: Tenant; onClose: () => void }) {
  const [tab, setTab] = useState<'mail' | 'audit'>('mail');
  const [mails, setMails] = useState<any[] | null>(null);
  const [audit, setAudit] = useState<any[] | null>(null);

  useEffect(() => {
    call('/tenants/' + t.id + '/email-log').then((r) => setMails(r.data || [])).catch((e) => toast.error(e.message));
    call('/tenants/' + t.id + '/audit').then((r) => setAudit(r.data || [])).catch((e) => toast.error(e.message));
  }, [t.id]);

  const when = (s: string) => new Date(s).toLocaleString('az-AZ');
  return (
    <Modal title={'Jurnal — ' + t.name} onClose={onClose} wide>
      <div className="flex gap-1 mb-4">
        {(
          [
            ['mail', 'Məktublar'],
            ['audit', 'Audit'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={'px-3 py-1.5 rounded-lg text-sm ' + (tab === k ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold' : 'text-[#475569]')}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'mail' &&
        (!mails ? (
          <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" />
        ) : mails.length === 0 ? (
          <p className="text-sm text-[#64748B] py-6 text-center">Hələ məktub yoxdur</p>
        ) : (
          <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs text-[#64748B]">
                <tr>
                  <th className="px-3 py-2">Vaxt</th>
                  <th className="px-3 py-2">Kimə</th>
                  <th className="px-3 py-2">Mövzu</th>
                  <th className="px-3 py-2">Vəziyyət</th>
                </tr>
              </thead>
              <tbody>
                {mails.map((m) => (
                  <tr key={m.id} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2 text-xs text-[#64748B] whitespace-nowrap">{when(m.created_at)}</td>
                    <td className="px-3 py-2">{m.to}</td>
                    <td className="px-3 py-2 max-w-[280px] truncate" title={m.subject}>{m.subject}</td>
                    <td className="px-3 py-2">
                      <span className={'text-[11px] font-semibold px-2 py-0.5 rounded-full ' + (MAIL_STATUS[m.status]?.cls || '')} title={m.error || ''}>
                        {MAIL_STATUS[m.status]?.label || m.status}
                      </span>
                      {m.error && <span className="block text-[11px] text-[#94A3B8] max-w-[220px] truncate" title={m.error}>{m.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {tab === 'audit' &&
        (!audit ? (
          <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" />
        ) : audit.length === 0 ? (
          <p className="text-sm text-[#64748B] py-6 text-center">Hələ qeyd yoxdur</p>
        ) : (
          <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs text-[#64748B]">
                <tr>
                  <th className="px-3 py-2">Vaxt</th>
                  <th className="px-3 py-2">Kim</th>
                  <th className="px-3 py-2">Hadisə</th>
                  <th className="px-3 py-2">Bölmə</th>
                  <th className="px-3 py-2">Qeyd</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t border-[#F1F5F9]">
                    <td className="px-3 py-2 text-xs text-[#64748B] whitespace-nowrap">{when(a.created_at)}</td>
                    <td className="px-3 py-2">{a.user_email || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{AUDIT_AZ[a.action] || a.action}</td>
                    <td className="px-3 py-2 text-[#64748B]">{a.resource}{a.ref_id ? ' #' + a.ref_id : ''}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={a.detail}>{a.detail}</td>
                    <td className="px-3 py-2 text-xs text-[#94A3B8]">{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </Modal>
  );
}

// ============================================================
// Super adminlər
// ============================================================
function SuperAdmins({ me }: { me: { id: number; email: string } | null }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<any>(null);

  const load = useCallback(() => {
    call('/admins').then((r) => setRows(r.data || [])).catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call('/admins', 'POST', f);
      toast.success('Super admin əlavə edildi');
      setF({ name: '', email: '', password: '' });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await call('/admins/' + del.id, 'DELETE');
      toast.success('Silindi');
      setDel(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid gap-6 md:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0F172A]">Super adminlər</h1>
        <p className="text-sm text-[#64748B] mb-4">Bütün mərkəzləri idarə edən hesablar. Bir e-poçta 5 səhv girişdən sonra 15 dəqiqəlik blok düşür.</p>
        {!rows ? (
          <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" />
        ) : (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] divide-y divide-[#F1F5F9]">
            {rows.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <ShieldCheck className="w-4 h-4 text-[#4F46E5]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0F172A]">{a.name} {me && me.id === a.id && <span className="text-xs font-normal text-[#64748B]">(siz)</span>}</p>
                  <p className="text-xs text-[#64748B]">{a.email} · {new Date(a.created_at).toLocaleDateString('az-AZ')}</p>
                </div>
                {me && me.id !== a.id && (
                  <button className={ghost} onClick={() => setDel(a)}>
                    <Trash2 className="w-3.5 h-3.5" /> Sil
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <form onSubmit={add} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-3 self-start">
        <p className="font-semibold text-[#0F172A] flex items-center gap-2"><UserPlus className="w-4 h-4" /> Yeni super admin</p>
        <Field label="Ad">
          <input className={input} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="E-poçt">
          <input className={input} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Parol (ən azı 8 simvol)">
          <input className={input} type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <button disabled={busy} className={primary + ' w-full'}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Əlavə et
        </button>
      </form>
      {del && (
        <Modal title="Super admin silinsin?" onClose={() => setDel(null)}>
          <p className="text-sm text-[#475569] mb-4">{del.name} ({del.email}) panelə daha daxil ola bilməyəcək.</p>
          <div className="flex justify-end gap-2">
            <button className={ghost} onClick={() => setDel(null)}>Ləğv et</button>
            <button disabled={busy} onClick={remove} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#DC2626] text-white text-xs font-semibold">
              <Trash2 className="w-3.5 h-3.5" /> Sil
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
