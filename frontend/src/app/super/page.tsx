'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Building2, CheckCircle2, ChevronRight, ExternalLink, Globe, KeyRound, Loader2, LogOut,
  Mail, Menu, PauseCircle, PlayCircle, Plus, ScrollText, Search, Send, Settings, ShieldCheck, Trash2, UserCog, UserPlus,
  Users, X, LayoutGrid,
} from 'lucide-react';
import { CONFIG as C } from './config';

// ============================================================
// Super admin paneli — mərkəzləri (büroları) yaratmaq və idarə etmək.
// Bu fayl Education Center və Professional Law-da eynidir; tətbiqə aid
// sözlər və imkanlar ./config.ts-dədir.
//
// Ünvanlar (hash): #/ siyahı · #/c/<id>/<tab> səhifə · #/new · #/admins · #/account
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

interface Me {
  id: number;
  name: string;
  email: string;
  created_at?: string;
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

type Route =
  | { name: 'list' }
  | { name: 'centre'; id: number; tab: string }
  | { name: 'new' }
  | { name: 'admins' }
  | { name: 'account' };

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

function parseRoute(): Route {
  const h = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#\/?/, '');
  const p = h.split('/').filter(Boolean);
  if (p[0] === 'c' && p[1]) return { name: 'centre', id: Number(p[1]), tab: p[2] || 'overview' };
  if (p[0] === 'new') return { name: 'new' };
  if (p[0] === 'admins') return { name: 'admins' };
  if (p[0] === 'account') return { name: 'account' };
  return { name: 'list' };
}

function go(path: string) {
  window.location.hash = path;
  window.scrollTo({ top: 0 });
}

const hosts = (text: string) => text.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('az-AZ') : '—');
const fmtTime = (s: string) => new Date(s).toLocaleString('az-AZ');
const initials = (s: string) =>
  s.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

// ---------------- kiçik UI hissələri ----------------

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-[#DCDFE5] bg-white text-[15px] text-[#15181E] placeholder:text-[#9AA1AD] focus:outline-none focus:ring-2 focus:ring-[var(--acc-s)] focus:border-[var(--acc)]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-[#3A4150] mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-[#6B7280] mt-1">{hint}</span>}
    </label>
  );
}

function Btn({
  children, onClick, kind = 'primary', type = 'button', disabled, className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'subtle';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  const k = {
    primary: 'bg-[var(--acc)] hover:bg-[var(--acc-h)] text-white',
    ghost: 'bg-white border border-[#DCDFE5] text-[#15181E] hover:bg-[#F6F7F9]',
    danger: 'bg-white border border-[#F2C4CC] text-[#B4233A] hover:bg-[#FCEEF0]',
    subtle: 'text-[#3A4150] hover:bg-[#EEF0F3]',
  }[kind];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-[14px] font-semibold transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc-s)] ' + k + ' ' + className}
    >
      {children}
    </button>
  );
}

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'muted' | 'bad' | 'info'; children: React.ReactNode }) {
  const t = {
    ok: 'bg-[#E7F5EE] text-[#1E7A4C]',
    warn: 'bg-[#FFF1DB] text-[#9A5200]',
    muted: 'bg-[#EEF0F3] text-[#5B6270]',
    bad: 'bg-[#FCE8EC] text-[#B4233A]',
    info: 'bg-[var(--acc-s)] text-[var(--acc)]',
  }[tone];
  return (
    <span className={'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ' + t}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Card({ title, action, children, className = '' }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={'bg-white border border-[#E3E6EB] rounded-xl ' + className}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h3 className="text-[15px] font-bold text-[#15181E]">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[rgba(15,18,24,.45)] p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold text-[#15181E]">{title}</h2>
          <button onClick={onClose} aria-label="Bağla" className="w-9 h-9 -mr-2 rounded-lg flex items-center justify-center text-[#8A919E] hover:bg-[#F3F4F6]">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function mailTone(t: Tenant): { tone: 'ok' | 'warn' | 'info'; text: string } {
  if (t.mail_source === 'own') return { tone: 'ok', text: 'Öz SMTP-si' };
  if (t.mail_source === 'server') return { tone: 'info', text: 'Serverin SMTP-si' };
  return { tone: 'warn', text: 'Qurulmayıb' };
}

// ============================================================
// Giriş
// ============================================================

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
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F3F4F6] text-[#15181E]">
      <div className="md:w-[44%] bg-[#14171C] text-white px-8 py-10 md:p-14 flex flex-col justify-between gap-10">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[var(--acc)] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-bold text-[17px]">{C.product}</span>
            <span className="text-[13px] text-[#9AA1AD]">Super admin</span>
          </span>
        </div>
        <div className="hidden md:block">
          <h1 className="text-[34px] leading-tight font-bold">{C.unitPl} bir yerdən idarə olunur.</h1>
          <p className="mt-3 text-[#AEB4BF] max-w-md">
            Hər {C.unitLower} öz domenində açılır, öz bazasında saxlanılır. Yaratmaq, dayandırmaq, e-poçtu qurmaq və istifadəçilərə kömək etmək — buradan.
          </p>
        </div>
        <p className="hidden md:block text-[13px] text-[#7C838F]">Yalnız super adminlər üçündür.</p>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="text-[26px] font-bold">Daxil olun</h2>
            <p className="text-[#5B6270] mt-1">Super admin hesabınızla.</p>
          </div>
          <Field label="E-poçt">
            <input className={inputCls} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Parol">
            <input className={inputCls} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {error && (
            <p className="flex items-start gap-2 text-sm text-[#B4233A] bg-[#FCE8EC] rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <Btn type="submit" disabled={busy} className="w-full">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Daxil ol
          </Btn>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Panel: yan menyu + səhifələr
// ============================================================

function Sidebar({ route, count, me, onOut, onNav }: { route: Route; count: number; me: Me | null; onOut: () => void; onNav?: () => void }) {
  const item = (href: string, label: string, Icon: any, on: boolean, badge?: number) => (
    <a
      href={href}
      onClick={onNav}
      className={
        'flex items-center gap-3 h-10 px-3 rounded-lg text-[14.5px] transition-colors ' +
        (on ? 'bg-white/10 text-white font-semibold' : 'text-[#C4C9D2] hover:bg-white/5')
      }
    >
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
      {label}
      {badge !== undefined && <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-white/10">{badge}</span>}
    </a>
  );
  return (
    <div className="h-full flex flex-col gap-7 px-3.5 py-5">
      <div className="flex items-center gap-3 px-2">
        <span className="w-9 h-9 rounded-[10px] bg-[var(--acc)] flex items-center justify-center">
          <ShieldCheck className="w-[18px] h-[18px] text-white" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-bold text-[15px] text-white">{C.product}</span>
          <span className="text-xs text-[#9AA1AD]">Super admin</span>
        </span>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Əsas menyu">
        {item('#/', C.unitPl, Building2, route.name === 'list' || route.name === 'centre' || route.name === 'new', count)}
        {item('#/admins', 'Super adminlər', ShieldCheck, route.name === 'admins')}
        {item('#/account', 'Hesabım və parol', KeyRound, route.name === 'account')}
      </nav>
      <div className="mt-auto flex items-center gap-3 pt-4 px-2 border-t border-white/10">
        <span className="w-8 h-8 rounded-full bg-[#2A2F38] text-white flex items-center justify-center text-xs font-bold shrink-0">
          {initials(me?.name || 'SA')}
        </span>
        <span className="flex flex-col min-w-0 leading-tight">
          <span className="text-[14px] font-semibold text-white truncate">{me?.name || 'Super admin'}</span>
          <span className="text-xs text-[#9AA1AD] truncate">{me?.email}</span>
        </span>
        <button onClick={onOut} aria-label="Çıxış" title="Çıxış" className="ml-auto w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[#9AA1AD] hover:bg-white/5 hover:text-white">
          <LogOut className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}

function Panel({ onOut }: { onOut: () => void }) {
  const [route, setRoute] = useState<Route>({ name: 'list' });
  const [list, setList] = useState<Tenant[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const on = () => {
      setRoute(parseRoute());
      setDrawer(false);
    };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const load = useCallback(() => {
    call('/tenants')
      .then((r) => setList(r.data || []))
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    call('/me').then(setMe).catch(() => {});
  }, []);

  const centre = route.name === 'centre' && list ? list.find((t) => t.id === route.id) : undefined;

  return (
    <div className="min-h-screen flex bg-[#F3F4F6] text-[#15181E] text-[15px]">
      <aside className="hidden lg:block w-[248px] shrink-0 bg-[#14171C]">
        <div className="sticky top-0 h-screen">
          <Sidebar route={route} count={list?.length || 0} me={me} onOut={onOut} />
        </div>
      </aside>

      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40 flex" onClick={() => setDrawer(false)}>
          <div className="w-[272px] max-w-[85vw] h-full bg-[#14171C]" onClick={(e) => e.stopPropagation()}>
            <Sidebar route={route} count={list?.length || 0} me={me} onOut={onOut} onNav={() => setDrawer(false)} />
          </div>
          <div className="flex-1 bg-[rgba(15,18,24,.45)]" />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 h-14 bg-[#14171C] text-white flex items-center gap-3 px-4">
          <button onClick={() => setDrawer(true)} aria-label="Menyu" className="w-10 h-10 -ml-2 rounded-lg flex items-center justify-center hover:bg-white/10">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold">{C.product}</span>
          <span className="text-xs text-[#9AA1AD]">Super admin</span>
        </header>

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-9 py-6 lg:py-8">
          {route.name === 'list' && <ListView list={list} />}
          {route.name === 'new' && (
            <NewView
              onCreated={(t) => {
                load();
                go('/c/' + t.id + '/mail');
              }}
            />
          )}
          {route.name === 'centre' &&
            (!list ? (
              <Loader2 className="w-6 h-6 animate-spin text-[var(--acc)]" />
            ) : centre ? (
              <CentreView key={centre.id} t={centre} tab={route.tab} me={me} reload={load} />
            ) : (
              <EmptyBox text={C.unit + ' tapılmadı'} />
            ))}
          {route.name === 'admins' && <AdminsView me={me} />}
          {route.name === 'account' && <AccountView me={me} />}
        </main>
      </div>
    </div>
  );
}

function EmptyBox({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="bg-white border border-dashed border-[#D5D9E0] rounded-xl px-6 py-12 text-center">
      <p className="font-semibold text-[#3A4150]">{text}</p>
      {sub && <p className="text-sm text-[#6B7280] mt-1">{sub}</p>}
    </div>
  );
}

function PageHead({ title, sub, actions, back }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <a href={back.href} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#5B6270] hover:text-[#15181E] mb-3">
          <ArrowLeft className="w-4 h-4" /> {back.label}
        </a>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] sm:text-[28px] font-bold tracking-[-0.01em] leading-tight">{title}</h1>
          {sub && <div className="mt-1 text-[#5B6270]">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

// ============================================================
// Siyahı
// ============================================================

const LIST_GRID = 'lg:grid-cols-[minmax(240px,2.4fr)_minmax(120px,1fr)_minmax(150px,1.1fr)_repeat(4,minmax(70px,.7fr))_28px]';

function ListView({ list }: { list: Tenant[] | null }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list || []).filter((t) => !s || t.name.toLowerCase().includes(s) || t.domains.some((d) => d.host.includes(s)));
  }, [list, q]);

  const sum = (k: string) => (list || []).reduce((a, t) => a + (t.counts?.[k] || 0), 0);
  const active = (list || []).filter((t) => t.is_active).length;
  const attention = (list || []).filter((t) => t.mail_source === 'none' || t.error);

  return (
    <>
      <PageHead
        title={C.unitPl}
        sub={`Hər ${C.unitLower} öz domenində açılır, məlumatı öz bazasında saxlanılır.`}
        actions={
          <>
            <label className="relative w-full sm:w-auto">
              <span className="sr-only">Axtar</span>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A919E]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad və ya domen…" className={inputCls + ' pl-9 sm:w-[240px]'} />
            </label>
            <Btn onClick={() => go('/new')}>
              <Plus className="w-4 h-4" /> {C.newUnit}
            </Btn>
          </>
        }
      />

      {!list ? (
        <Loader2 className="w-6 h-6 animate-spin text-[var(--acc)]" />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <Kpi label={C.unitPl} value={list.length} sub={`${active} aktiv · ${list.length - active} dayandırılıb`} subTone={list.length - active ? 'muted' : 'ok'} />
            {C.mainCounts.slice(0, 3).map((c) => (
              <Kpi key={c.key} label={c.label} value={sum(c.key)} sub={`bütün ${C.unitPlLower} üzrə`} />
            ))}
            <div className="col-span-2 md:col-span-1">
              <Kpi label="Diqqət tələb edir" value={attention.length} sub={attention.length ? 'aşağıdakı siyahıya baxın' : 'hər şey qaydasındadır'} warn={attention.length > 0} />
            </div>
          </div>

          {attention.length > 0 && (
            <div className="bg-white border border-[#E3E6EB] rounded-xl divide-y divide-[#EEF0F3]">
              {attention.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-8 h-8 rounded-lg bg-[#FFF1DB] text-[#A35A00] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-semibold">
                      {t.name} — {t.error ? 'bazaya qoşulmaq olmur' : 'e-poçt (SMTP) qurulmayıb'}
                    </p>
                    <p className="text-[14px] text-[#5B6270]">
                      {t.error ? t.error : C.mailMissing + ' Ayarı yazıb sınaq məktubu göndərin.'}
                    </p>
                  </div>
                  {!t.error && (
                    <Btn kind="ghost" onClick={() => go('/c/' + t.id + '/mail')}>
                      <Mail className="w-4 h-4" /> E-poçtu qur
                    </Btn>
                  )}
                </div>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyBox
              text={list.length ? 'Axtarışa uyğun ' + C.unitLower + ' yoxdur' : 'Hələ ' + C.unitLower + ' yoxdur'}
              sub={list.length ? undefined : `"${C.newUnit}" düyməsi ilə ilkini yaradın.`}
            />
          ) : (
            <section className="bg-white border border-[#E3E6EB] rounded-xl overflow-hidden">
              <div className={'hidden lg:grid gap-x-4 px-5 py-2.5 bg-[#FAFBFC] border-b border-[#E3E6EB] text-[12px] font-semibold uppercase tracking-[.04em] text-[#6B7280] ' + LIST_GRID}>
                <span>{C.unit}</span>
                <span>Vəziyyət</span>
                <span>E-poçt</span>
                {C.mainCounts.map((c) => (
                  <span key={c.key} className="text-right">{c.label}</span>
                ))}
                <span />
              </div>
              {rows.map((t) => {
                const m = mailTone(t);
                return (
                  <a
                    key={t.id}
                    href={'#/c/' + t.id}
                    className={'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 border-b border-[#EEF0F3] last:border-b-0 hover:bg-[#F8F9FB] ' + LIST_GRID}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-[10px] bg-[#EEF1F6] text-[#3A4150] flex items-center justify-center text-[13px] font-bold shrink-0">
                        {initials(t.name)}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="font-semibold truncate">{t.name}</span>
                        <span className="text-[13px] text-[#5B6270] font-mono truncate">{t.domains.map((d) => d.host).join(', ') || '—'}</span>
                      </span>
                    </span>
                    <span className="lg:hidden text-[#8A919E]">
                      <ChevronRight className="w-5 h-5" />
                    </span>
                    <span className="flex flex-wrap gap-2 col-span-2 lg:col-span-1">
                      {t.is_active ? <Pill tone="ok">Aktiv</Pill> : <Pill tone="muted">Dayandırılıb</Pill>}
                      <span className="lg:hidden">
                        <Pill tone={m.tone}>E-poçt: {m.text}</Pill>
                      </span>
                    </span>
                    <span className="hidden lg:block">
                      <Pill tone={m.tone}>{m.text}</Pill>
                    </span>
                    {C.mainCounts.map((c) => (
                      <span key={c.key} className="hidden lg:block text-right tabular-nums">{t.counts?.[c.key] ?? '—'}</span>
                    ))}
                    <span className="hidden lg:flex justify-end text-[#8A919E]">
                      <ChevronRight className="w-5 h-5" />
                    </span>
                  </a>
                );
              })}
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, sub, warn, subTone }: { label: string; value: number; sub: string; warn?: boolean; subTone?: 'ok' | 'muted' }) {
  return (
    <div className={'h-full rounded-xl border px-4 py-3.5 ' + (warn ? 'bg-[#FFF7EA] border-[#F1D6A8]' : 'bg-white border-[#E3E6EB]')}>
      <div className={'text-[13px] ' + (warn ? 'text-[#8A4B00] font-semibold' : 'text-[#5B6270]')}>{label}</div>
      <div className={'text-[28px] font-bold leading-tight tabular-nums ' + (warn ? 'text-[#8A4B00]' : '')}>{value}</div>
      <div className={'text-[13px] ' + (warn ? 'text-[#8A4B00]' : subTone === 'ok' ? 'text-[#1E7A4C]' : 'text-[#6B7280]')}>{sub}</div>
    </div>
  );
}

// ============================================================
// Mərkəzin (büronun) səhifəsi
// ============================================================

function CentreView({ t, tab, me, reload }: { t: Tenant; tab: string; me: Me | null; reload: () => void }) {
  const tabs = [
    { id: 'overview', label: 'Ümumi', Icon: LayoutGrid },
    { id: 'users', label: 'İstifadəçilər', Icon: Users },
    { id: 'mail', label: 'E-poçt', Icon: Mail },
    ...(C.features.mailLog || C.features.audit ? [{ id: 'log', label: 'Jurnal', Icon: ScrollText }] : []),
    { id: 'settings', label: 'Ayarlar', Icon: Settings },
  ];
  const cur = tabs.find((x) => x.id === tab) ? tab : 'overview';
  const [pausing, setPausing] = useState(false);
  const [busy, setBusy] = useState(false);
  const m = mailTone(t);

  const setActive = async (on: boolean) => {
    setBusy(true);
    try {
      await call('/tenants/' + t.id, 'PUT', { name: t.name, is_active: on, domains: t.domains.map((d) => d.host) });
      toast.success(on ? C.unit + ' yenidən aktivdir' : C.unit + ' dayandırıldı');
      setPausing(false);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        back={{ href: '#/', label: C.unitPl }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.name}
            {t.is_active ? <Pill tone="ok">Aktiv</Pill> : <Pill tone="muted">Dayandırılıb</Pill>}
          </span>
        }
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {t.domains.map((d) => (
              <a key={d.host} href={'https://' + d.host} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[14px] text-[var(--acc)] hover:underline">
                {d.host} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ))}
            <span className="text-[13px]">
              E-poçt: <b className={m.tone === 'warn' ? 'text-[#9A5200]' : 'text-[#3A4150]'}>{m.text}</b>
            </span>
          </span>
        }
        actions={
          t.is_active ? (
            <Btn kind="ghost" onClick={() => setPausing(true)}>
              <PauseCircle className="w-4 h-4" /> Dayandır
            </Btn>
          ) : (
            <Btn onClick={() => setActive(true)} disabled={busy}>
              <PlayCircle className="w-4 h-4" /> Aktivləşdir
            </Btn>
          )
        }
      />

      <nav className="flex flex-wrap gap-1 mb-6 border-b border-[#E3E6EB]" aria-label={C.unitGen + ' bölmələri'}>
        {tabs.map((x) => (
          <a
            key={x.id}
            href={'#/c/' + t.id + (x.id === 'overview' ? '' : '/' + x.id)}
            aria-current={cur === x.id ? 'page' : undefined}
            className={
              'relative inline-flex items-center gap-2 h-11 px-3.5 text-[14.5px] ' +
              (cur === x.id ? 'text-[#15181E] font-semibold' : 'text-[#5B6270] hover:text-[#15181E]')
            }
          >
            <x.Icon className="w-4 h-4" />
            {x.label}
            {x.id === 'mail' && t.mail_source === 'none' && <span className="w-2 h-2 rounded-full bg-[#E08A00]" title="qurulmayıb" />}
            {cur === x.id && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[var(--acc)]" />}
          </a>
        ))}
      </nav>

      {cur === 'overview' && <OverviewTab t={t} reload={reload} />}
      {cur === 'users' && <UsersTab t={t} />}
      {cur === 'mail' && <MailTab t={t} me={me} reload={reload} />}
      {cur === 'log' && <LogTab t={t} />}
      {cur === 'settings' && <SettingsTab t={t} reload={reload} onPause={() => setPausing(true)} onResume={() => setActive(true)} />}

      {pausing && (
        <Modal title={t.name + ' dayandırılsın?'} onClose={() => setPausing(false)}>
          <p className="text-[#3A4150]">
            Dayandırılan {C.unitLower} açılmır: heç kim daxil ola bilmir. Məlumat silinmir — istənilən vaxt yenidən aktivləşdirmək olar.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Btn kind="ghost" onClick={() => setPausing(false)}>Ləğv et</Btn>
            <Btn kind="danger" onClick={() => setActive(false)} disabled={busy}>
              <PauseCircle className="w-4 h-4" /> Dayandır
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------- Ümumi ----------

function OverviewTab({ t, reload }: { t: Tenant; reload: () => void }) {
  const [adding, setAdding] = useState(false);
  const [pw, setPw] = useState(false);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="flex flex-col gap-5 min-w-0">
        {t.error && (
          <p className="flex items-start gap-2 text-[#B4233A] bg-[#FCE8EC] rounded-xl px-4 py-3">
            <AlertTriangle className="w-5 h-5 shrink-0" /> Bazaya qoşulmaq olmur: {t.error}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
          {C.counts.map((c) => (
            <div key={c.key} className="bg-white border border-[#E3E6EB] rounded-xl px-4 py-3.5">
              <div className="text-[13px] text-[#5B6270]">{c.label}</div>
              <div className="text-[26px] font-bold tabular-nums leading-tight">{t.counts?.[c.key] ?? '—'}</div>
            </div>
          ))}
        </div>

        <Card title="Domenlər" action={<a href={'#/c/' + t.id + '/settings'} className="text-[14px] font-semibold text-[var(--acc)]">Dəyiş</a>}>
          <div className="flex flex-col divide-y divide-[#EEF0F3] -my-2">
            {t.domains.map((d) => (
              <div key={d.host} className="flex flex-wrap items-center gap-3 py-2.5">
                <Globe className="w-4 h-4 text-[#8A919E]" />
                <a href={'https://' + d.host} target="_blank" rel="noreferrer" className="font-mono text-[14.5px] hover:underline">{d.host}</a>
                <a href={'https://' + d.host + '/login'} target="_blank" rel="noreferrer" className="ml-auto text-[13px] text-[#5B6270] hover:text-[#15181E] inline-flex items-center gap-1">
                  Giriş səhifəsi <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-[#6B7280] mt-4">
            Yeni domen işləsin deyə onun DNS-ində <b>A qeydi</b> bu serverin IP ünvanına yönəlməlidir (Cloudflare-də boz bulud — “DNS only”). Server sertifikatı özü alır; bir neçə dəqiqə çəkir.
          </p>
        </Card>
      </div>

      <div className="flex flex-col gap-5 min-w-0">
        <Card title="Tez əməliyyatlar">
          <div className="flex flex-col gap-2">
            <button onClick={() => setAdding(true)} className="flex items-center gap-3 rounded-lg border border-[#E3E6EB] px-3.5 py-3 text-left hover:bg-[#F8F9FB]">
              <UserPlus className="w-5 h-5 text-[var(--acc)] shrink-0" />
              <span className="flex flex-col">
                <span className="font-semibold">{C.addAdmin}</span>
                <span className="text-[13px] text-[#6B7280]">məs. sahibin özünə hesab</span>
              </span>
            </button>
            <button onClick={() => setPw(true)} className="flex items-center gap-3 rounded-lg border border-[#E3E6EB] px-3.5 py-3 text-left hover:bg-[#F8F9FB]">
              <KeyRound className="w-5 h-5 text-[var(--acc)] shrink-0" />
              <span className="flex flex-col">
                <span className="font-semibold">İstifadəçiyə yeni parol</span>
                <span className="text-[13px] text-[#6B7280]">parolunu unudan {C.admin.toLowerCase()} üçün</span>
              </span>
            </button>
            <a href={'#/c/' + t.id + '/users'} className="flex items-center gap-3 rounded-lg border border-[#E3E6EB] px-3.5 py-3 hover:bg-[#F8F9FB]">
              <Users className="w-5 h-5 text-[var(--acc)] shrink-0" />
              <span className="flex flex-col">
                <span className="font-semibold">İstifadəçilər</span>
                <span className="text-[13px] text-[#6B7280]">axtarış, aktiv / deaktiv{C.features.resetLink ? ', bərpa linki' : ''}</span>
              </span>
            </a>
          </div>
        </Card>
        <Card title="Texniki">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-[#6B7280]">Baza</dt>
            <dd className="font-mono break-all">{t.db_name}</dd>
            <dt className="text-[#6B7280]">Yaradılıb</dt>
            <dd>{fmtDate(t.created_at)}</dd>
            <dt className="text-[#6B7280]">ID</dt>
            <dd className="font-mono">{t.id}</dd>
          </dl>
        </Card>
      </div>

      {adding && <AddAdminModal t={t} onClose={() => setAdding(false)} onDone={reload} />}
      {pw && <SetPasswordModal t={t} onClose={() => setPw(false)} />}
    </div>
  );
}

function AddAdminModal({ t, onClose, onDone }: { t: Tenant; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call('/tenants/' + t.id + '/admin', 'POST', f);
      toast.success(C.admin + ' yaradıldı', { description: f.email });
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={C.addAdmin + ' — ' + t.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Ad və soyad">
          <input className={inputCls} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="E-poçt">
          <input className={inputCls} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Parol" hint={`Ən azı ${C.minPassword} simvol. Daxil olandan sonra özü dəyişə bilər.`}>
          <input className={inputCls} type="password" minLength={C.minPassword} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Btn kind="ghost" onClick={onClose}>Ləğv et</Btn>
          <Btn type="submit" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Yarat
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function SetPasswordModal({ t, email, onClose }: { t: Tenant; email?: string; onClose: () => void }) {
  const [f, setF] = useState({ email: email || '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call('/tenants/' + t.id + '/password', 'POST', f);
      toast.success('Parol dəyişdirildi', { description: f.email });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="İstifadəçiyə yeni parol" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="İstifadəçinin e-poçtu">
          <input className={inputCls} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} readOnly={!!email} />
        </Field>
        <Field label="Yeni parol" hint={`Ən azı ${C.minPassword} simvol. Hesab deaktiv idisə, aktiv olur.`}>
          <input className={inputCls} type="password" minLength={C.minPassword} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Btn kind="ghost" onClick={onClose}>Ləğv et</Btn>
          <Btn type="submit" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Saxla
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

// ---------- İstifadəçilər ----------

const USER_GRID = 'lg:grid-cols-[minmax(220px,2fr)_minmax(110px,.8fr)_minmax(140px,1fr)_minmax(110px,.8fr)_350px]';

function UsersTab({ t }: { t: Tenant }) {
  const [rows, setRows] = useState<CentreUser[] | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(0);
  const [pwFor, setPwFor] = useState<CentreUser | null>(null);

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2.5">
        <label className="relative flex-1 min-w-[220px] max-w-md">
          <span className="sr-only">Axtar</span>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A919E]" />
          <input className={inputCls + ' pl-9'} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad və ya e-poçt…" />
        </label>
        <label>
          <span className="sr-only">Rol</span>
          <select className={inputCls + ' w-auto pr-8'} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Bütün rollar</option>
            {Object.keys(C.roles).map((r) => (
              <option key={r} value={r}>{C.roles[r]}</option>
            ))}
          </select>
        </label>
      </div>

      {!rows ? (
        <Loader2 className="w-6 h-6 animate-spin text-[var(--acc)]" />
      ) : rows.length === 0 ? (
        <EmptyBox text="İstifadəçi tapılmadı" />
      ) : (
        <section className="bg-white border border-[#E3E6EB] rounded-xl overflow-hidden">
          <div className={'hidden lg:grid gap-x-4 px-5 py-2.5 bg-[#FAFBFC] border-b border-[#E3E6EB] text-[12px] font-semibold uppercase tracking-[.04em] text-[#6B7280] ' + USER_GRID}>
            <span>İstifadəçi</span>
            <span>Rol</span>
            <span>Son giriş</span>
            <span>Vəziyyət</span>
            <span />
          </div>
          {rows.map((u) => (
            <div key={u.id} className={'grid grid-cols-1 items-center gap-x-4 gap-y-2 px-5 py-3.5 border-b border-[#EEF0F3] last:border-b-0 ' + USER_GRID}>
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-[#EEF1F6] text-[#3A4150] flex items-center justify-center text-[12px] font-bold shrink-0">{initials(u.name)}</span>
                <span className="flex flex-col min-w-0">
                  <span className="font-semibold truncate">{u.name}</span>
                  <span className="text-[13px] text-[#5B6270] truncate">{u.email}</span>
                </span>
              </span>
              <span className="text-[14px]">
                <span className="lg:hidden text-[#6B7280]">Rol: </span>
                {C.roles[u.role] || (u.role ? u.role : 'Rol seçilməyib')}
              </span>
              <span className="text-[14px] text-[#5B6270] tabular-nums">
                <span className="lg:hidden">Son giriş: </span>
                {u.last_login || 'hələ girməyib'}
              </span>
              <span>{!u.is_active ? <Pill tone="muted">Deaktiv</Pill> : u.status === 'pending' ? <Pill tone="warn">Gözləyir</Pill> : <Pill tone="ok">Aktiv</Pill>}</span>
              <span className="flex flex-wrap lg:flex-nowrap gap-1.5 lg:justify-end">
                {C.features.resetLink && u.is_active && (
                  <Btn
                    kind="ghost"
                    className="h-9 px-3 text-[13px]"
                    disabled={busy === u.id}
                    onClick={() => act(u, () => call('/tenants/' + t.id + '/users/' + u.id + '/reset-link', 'POST'), 'Bərpa linki göndərildi: ' + u.email)}
                  >
                    <Send className="w-3.5 h-3.5" /> Bərpa linki
                  </Btn>
                )}
                <Btn kind="ghost" className="h-9 px-3 text-[13px]" onClick={() => setPwFor(u)}>
                  <KeyRound className="w-3.5 h-3.5" /> Parol
                </Btn>
                <Btn
                  kind={u.is_active ? 'danger' : 'ghost'}
                  className="h-9 px-3 text-[13px]"
                  disabled={busy === u.id}
                  onClick={() => act(u, () => call('/tenants/' + t.id + '/users/' + u.id, 'PUT', { is_active: !u.is_active }), u.is_active ? 'Deaktiv edildi' : 'Aktiv edildi')}
                >
                  {u.is_active ? 'Deaktiv et' : 'Aktiv et'}
                </Btn>
              </span>
            </div>
          ))}
        </section>
      )}
      <p className="text-[13px] text-[#6B7280]">Ən çox 300 nəticə göstərilir — axtarışdan istifadə edin. Deaktiv edilən hesab daha daxil ola bilmir.</p>
      {pwFor && <SetPasswordModal t={t} email={pwFor.email} onClose={() => setPwFor(null)} />}
    </div>
  );
}

// ---------- E-poçt ----------

function MailTab({ t, me, reload }: { t: Tenant; me: Me | null; reload: () => void }) {
  const empty = { host: '', port: '587', user: '', password: '', from: '', from_name: '' };
  const [f, setF] = useState({
    host: t.smtp_host || '',
    port: t.smtp_port || '587',
    user: t.smtp_user || '',
    password: '',
    from: t.smtp_from || '',
    from_name: t.smtp_from_name || '',
  });
  const [to, setTo] = useState(me?.email || '');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!to && me?.email) setTo(me.email);
  }, [me, to]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = async (clear?: boolean) => {
    setBusy(clear ? 'clear' : 'save');
    try {
      const mail = clear ? { ...empty, port: '' } : f;
      await call('/tenants/' + t.id, 'PUT', { name: t.name, is_active: t.is_active, domains: t.domains.map((d) => d.host), mail });
      toast.success(clear ? C.unitGen + ' SMTP-si silindi' : 'E-poçt ayarları saxlanıldı');
      setF(clear ? empty : { ...f, password: '' });
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const r = await call('/tenants/' + t.id + '/test-mail', 'POST', { to });
      toast.success('Sınaq məktubu göndərildi', { description: r.to });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const m = mailTone(t);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <Card title="SMTP ayarı">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="SMTP server">
              <input className={inputCls} value={f.host} onChange={set('host')} placeholder="smtp.gmail.com" />
            </Field>
            <Field label="Port">
              <input className={inputCls} value={f.port} onChange={set('port')} placeholder="587" inputMode="numeric" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="İstifadəçi">
              <input className={inputCls} value={f.user} onChange={set('user')} autoComplete="off" />
            </Field>
            <Field label="Parol" hint={t.smtp_password_set ? 'Saxlanılıb — dəyişmək üçün yenisini yazın' : undefined}>
              <input className={inputCls} type="password" value={f.password} onChange={set('password')} autoComplete="new-password" placeholder={t.smtp_password_set ? '••••••••' : ''} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Göndərən ünvan">
              <input className={inputCls} type="email" value={f.from} onChange={set('from')} placeholder={'noreply@' + (t.domains[0]?.host || C.domainExample)} />
            </Field>
            <Field label="Göndərənin adı">
              <input className={inputCls} value={f.from_name} onChange={set('from_name')} placeholder={t.name} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Btn type="submit" disabled={!!busy}>
              {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Saxla
            </Btn>
            {t.smtp_host && (
              <Btn kind="subtle" onClick={() => save(true)} disabled={!!busy}>
                <Trash2 className="w-4 h-4" /> SMTP-ni sil
              </Btn>
            )}
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-5 min-w-0">
        <Card title="Vəziyyət">
          <div className="flex items-start gap-3">
            {m.tone === 'warn' ? <AlertTriangle className="w-5 h-5 text-[#A35A00] shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 text-[#1E7A4C] shrink-0 mt-0.5" />}
            <p className="text-[14.5px] text-[#3A4150]">
              {t.mail_source === 'own'
                ? `Məktublar ${t.name} adından öz SMTP-si ilə gedir.`
                : t.mail_source === 'server'
                ? 'Öz ayarı yoxdur — serverin ümumi SMTP-si işləyir. Göndərənin adı ' + t.name + ' olur.'
                : 'Heç bir SMTP yoxdur. ' + C.mailMissing}
            </p>
          </div>
        </Card>
        <Card title="Sınaq məktubu">
          <p className="text-[13px] text-[#6B7280] mb-3">Saxlanmış ayarla gedir — əvvəlcə “Saxla”nı basın.</p>
          <div className="flex gap-2">
            <label className="flex-1 min-w-0">
              <span className="sr-only">Kimə</span>
              <input className={inputCls} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="kimə" />
            </label>
            <Btn kind="ghost" onClick={test} disabled={!!busy}>
              {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Göndər
            </Btn>
          </div>
        </Card>
        <Card title="Gmail ilə">
          <ol className="list-decimal pl-5 space-y-1 text-[14px] text-[#3A4150]">
            <li>
              Server: <span className="font-mono">smtp.gmail.com</span>, port <span className="font-mono">587</span>
            </li>
            <li>İstifadəçi: Gmail ünvanı</li>
            <li>Parol: Google hesabında yaradılan “App password”</li>
            <li>Göndərən ünvan: həmin Gmail ünvanı</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

// ---------- Jurnal ----------

const MAIL_STATUS: Record<string, { tone: 'ok' | 'bad' | 'warn'; label: string }> = {
  sent: { tone: 'ok', label: 'Göndərildi' },
  failed: { tone: 'bad', label: 'Alınmadı' },
  skipped: { tone: 'warn', label: 'Göndərilmədi' },
};

const AUDIT_AZ: Record<string, string> = {
  login: 'Giriş', login_failed: 'Uğursuz giriş', registered: 'Qeydiyyat', password_reset_requested: 'Parol bərpası istəndi',
  password_reset: 'Parol bərpa edildi', password_changed: 'Parol dəyişdirildi', password_set: 'Parol təyin edildi',
  password_set_by_admin: 'Admin parol verdi', password_reset_sent: 'Bərpa linki göndərildi', logout_all: 'Bütün cihazlardan çıxış',
  user_created: 'Hesab yaradıldı', user_updated: 'Hesab dəyişdirildi', user_deleted: 'Hesab silindi',
  create: 'Yaradıldı', update: 'Dəyişdirildi', delete: 'Silindi', archive: 'Arxivə', restore: 'Arxivdən qaytarıldı',
  payment: 'Ödəniş qəbul edildi',
};

function LogTab({ t }: { t: Tenant }) {
  const [sub, setSub] = useState<'mail' | 'audit'>(C.features.mailLog ? 'mail' : 'audit');
  const [mails, setMails] = useState<any[] | null>(null);
  const [audit, setAudit] = useState<any[] | null>(null);

  useEffect(() => {
    if (C.features.mailLog) call('/tenants/' + t.id + '/email-log').then((r) => setMails(r.data || [])).catch((e) => toast.error(e.message));
    if (C.features.audit) call('/tenants/' + t.id + '/audit').then((r) => setAudit(r.data || [])).catch((e) => toast.error(e.message));
  }, [t.id]);

  const subBtn = (id: 'mail' | 'audit', label: string) => (
    <button onClick={() => setSub(id)} className={'h-9 px-3.5 rounded-lg text-[14px] ' + (sub === id ? 'bg-white shadow-sm font-semibold text-[#15181E]' : 'text-[#5B6270]')}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {C.features.mailLog && C.features.audit && (
        <div className="inline-flex self-start gap-1 p-1 rounded-xl bg-[#E8EAEE]">
          {subBtn('mail', 'Məktublar')}
          {subBtn('audit', 'Audit')}
        </div>
      )}
      {sub === 'mail' &&
        (!mails ? (
          <Loader2 className="w-6 h-6 animate-spin text-[var(--acc)]" />
        ) : mails.length === 0 ? (
          <EmptyBox text="Hələ məktub yoxdur" sub="Göndərilən hər məktub (və göndərilməyənlər) burada görünəcək." />
        ) : (
          <section className="bg-white border border-[#E3E6EB] rounded-xl overflow-hidden">
            {mails.map((m) => {
              const s = MAIL_STATUS[m.status] || MAIL_STATUS.skipped;
              return (
                <div key={m.id} className="grid grid-cols-1 md:grid-cols-[170px_minmax(160px,1fr)_minmax(200px,2fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 border-b border-[#EEF0F3] last:border-b-0">
                  <span className="text-[13px] text-[#6B7280] tabular-nums">{fmtTime(m.created_at)}</span>
                  <span className="text-[14px] truncate">{m.to}</span>
                  <span className="text-[14px] text-[#3A4150] truncate" title={m.subject}>{m.subject}</span>
                  <span className="flex flex-col items-start md:items-end gap-0.5">
                    <Pill tone={s.tone}>{s.label}</Pill>
                    {m.error && <span className="text-[12px] text-[#8A919E] max-w-[260px] truncate" title={m.error}>{m.error}</span>}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      {sub === 'audit' &&
        (!audit ? (
          <Loader2 className="w-6 h-6 animate-spin text-[var(--acc)]" />
        ) : audit.length === 0 ? (
          <EmptyBox text="Hələ qeyd yoxdur" />
        ) : (
          <section className="bg-white border border-[#E3E6EB] rounded-xl overflow-hidden">
            {audit.map((a) => (
              <div key={a.id} className="grid grid-cols-1 md:grid-cols-[170px_minmax(160px,1fr)_minmax(150px,1fr)_minmax(160px,1.4fr)_110px] items-center gap-x-4 gap-y-1 px-5 py-3 border-b border-[#EEF0F3] last:border-b-0">
                <span className="text-[13px] text-[#6B7280] tabular-nums">{fmtTime(a.created_at)}</span>
                <span className="text-[14px] truncate">{a.user_email || '—'}</span>
                <span className="text-[14px] font-semibold">{AUDIT_AZ[a.action] || a.action}</span>
                <span className="text-[14px] text-[#5B6270] truncate" title={a.detail}>
                  {a.resource}
                  {a.ref_id ? ' #' + a.ref_id : ''}
                  {a.detail ? ' · ' + a.detail : ''}
                </span>
                <span className="text-[12.5px] text-[#8A919E] font-mono md:text-right">{a.ip}</span>
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}

// ---------- Ayarlar ----------

function SettingsTab({ t, reload, onPause, onResume }: { t: Tenant; reload: () => void; onPause: () => void; onResume: () => void }) {
  const [name, setName] = useState(t.name);
  const [domains, setDomains] = useState(t.domains.map((d) => d.host).join('\n'));
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call('/tenants/' + t.id, 'PUT', { name, is_active: t.is_active, domains: hosts(domains) });
      toast.success('Saxlanıldı');
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <Card title={C.unitGen + ' məlumatı'}>
        <form onSubmit={save} className="space-y-4">
          <Field label={C.unitGen + ' adı'}>
            <input className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Domenlər" hint={`Hər sətirdə bir domen, məs. ${C.domainExample} və www.${C.domainExample}. Başqa ${C.unitLower} işlədən domen qəbul olunmur.`}>
            <textarea className={inputCls + ' h-auto min-h-[110px] py-2.5 font-mono text-[14px]'} required value={domains} onChange={(e) => setDomains(e.target.value)} />
          </Field>
          <Btn type="submit" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Saxla
          </Btn>
        </form>
      </Card>
      <Card title={t.is_active ? 'Dayandırmaq' : 'Dayandırılıb'}>
        <p className="text-[14px] text-[#3A4150] mb-4">
          {t.is_active
            ? `Dayandırılan ${C.unitLower} açılmır və heç kim daxil ola bilmir. Məlumat silinmir.`
            : `Bu ${C.unitLower} indi açılmır. Aktivləşdirəndə hər şey əvvəlki kimi işləyir.`}
        </p>
        {t.is_active ? (
          <Btn kind="danger" onClick={onPause}>
            <PauseCircle className="w-4 h-4" /> Dayandır
          </Btn>
        ) : (
          <Btn onClick={onResume}>
            <PlayCircle className="w-4 h-4" /> Aktivləşdir
          </Btn>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// Yeni mərkəz (büro)
// ============================================================

function NewView({ onCreated }: { onCreated: (t: Tenant) => void }) {
  const [f, setF] = useState({ name: '', domains: '', admin_name: '', admin_email: '', admin_password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await call('/tenants', 'POST', {
        name: f.name,
        domains: hosts(f.domains),
        admin: { name: f.admin_name, email: f.admin_email, password: f.admin_password },
      });
      toast.success(C.created, { description: 'Növbəti addım: e-poçtu qurun.' });
      onCreated(t);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const step = (n: number, title: string, sub: string, children: React.ReactNode) => (
    <section className="bg-white border border-[#E3E6EB] rounded-xl p-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="flex gap-3">
        <span className="w-8 h-8 rounded-full bg-[var(--acc-s)] text-[var(--acc)] font-bold flex items-center justify-center shrink-0">{n}</span>
        <div>
          <h3 className="font-bold text-[16px]">{title}</h3>
          <p className="text-[13.5px] text-[#6B7280] mt-0.5">{sub}</p>
        </div>
      </div>
      <div className="space-y-4 min-w-0">{children}</div>
    </section>
  );
  return (
    <>
      <PageHead back={{ href: '#/', label: C.unitPl }} title={C.newUnit} sub="Baza, cədvəllər və ilkin məlumat avtomatik yaranır." />
      <form onSubmit={submit} className="flex flex-col gap-4">
        {step(
          1,
          C.unit,
          'İstifadəçilərin görəcəyi ad.',
          <Field label={C.unitGen + ' adı'}>
            <input className={inputCls} required value={f.name} onChange={set('name')} />
          </Field>,
        )}
        {step(
          2,
          'Domenlər',
          `${C.unit} bu ünvanlarda açılacaq.`,
          <>
            <Field label="Domenlər" hint={`Hər sətirdə bir domen, məs. ${C.domainExample} və www.${C.domainExample}`}>
              <textarea className={inputCls + ' h-auto min-h-[96px] py-2.5 font-mono text-[14px]'} required value={f.domains} onChange={set('domains')} placeholder={C.domainExample} />
            </Field>
            <p className="flex items-start gap-2 text-[13.5px] text-[#3A4150] bg-[#F6F7F9] rounded-lg px-3 py-2.5">
              <Globe className="w-4 h-4 mt-0.5 shrink-0 text-[#6B7280]" />
              Domenin DNS-ində A qeydini bu serverin IP ünvanına yönəldin (Cloudflare-də boz bulud). Sertifikatı server özü alır.
            </p>
          </>,
        )}
        {step(
          3,
          C.firstAdmin,
          `${C.unitGen} panelinə ilk daxil olacaq şəxs.`,
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Ad və soyad">
              <input className={inputCls} required value={f.admin_name} onChange={set('admin_name')} />
            </Field>
            <Field label="E-poçt">
              <input className={inputCls} type="email" required value={f.admin_email} onChange={set('admin_email')} />
            </Field>
            <Field label="Parol" hint={`Ən azı ${C.minPassword} simvol`}>
              <input className={inputCls} type="password" minLength={C.minPassword} required value={f.admin_password} onChange={set('admin_password')} autoComplete="new-password" />
            </Field>
          </div>,
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Btn kind="ghost" onClick={() => go('/')}>Ləğv et</Btn>
          <Btn type="submit" disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Yarat
          </Btn>
        </div>
      </form>
    </>
  );
}

// ============================================================
// Super adminlər və hesabım
// ============================================================

function AdminsView({ me }: { me: Me | null }) {
  const [rows, setRows] = useState<Me[] | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Me | null>(null);

  const load = useCallback(() => {
    call('/admins').then((r) => setRows(r.data || [])).catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await call('/admins', 'POST', f);
      toast.success('Super admin əlavə edildi', { description: f.email });
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
    <>
      <PageHead title="Super adminlər" sub={`Bütün ${C.unitPlLower} idarə edən hesablar. Bir e-poçta 5 səhv girişdən sonra 15 dəqiqəlik blok düşür.`} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="bg-white border border-[#E3E6EB] rounded-xl overflow-hidden self-start">
          {!rows ? (
            <div className="p-5">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--acc)]" />
            </div>
          ) : (
            rows.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-[#EEF0F3] last:border-b-0">
                <span className="w-9 h-9 rounded-full bg-[#14171C] text-white flex items-center justify-center text-[12px] font-bold shrink-0">{initials(a.name)}</span>
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold">
                    {a.name} {me && me.id === a.id && <span className="text-[13px] font-normal text-[#6B7280]">(siz)</span>}
                  </span>
                  <span className="text-[13px] text-[#5B6270] truncate">
                    {a.email} · {fmtDate(a.created_at)}
                  </span>
                </span>
                {me && me.id !== a.id && (
                  <Btn kind="danger" className="h-9 px-3 text-[13px]" onClick={() => setDel(a)}>
                    <Trash2 className="w-3.5 h-3.5" /> Sil
                  </Btn>
                )}
              </div>
            ))
          )}
        </section>
        <Card title="Yeni super admin">
          <form onSubmit={add} className="space-y-3.5">
            <Field label="Ad">
              <input className={inputCls} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="E-poçt">
              <input className={inputCls} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Parol" hint="Ən azı 8 simvol">
              <input className={inputCls} type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
            </Field>
            <Btn type="submit" disabled={busy} className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Əlavə et
            </Btn>
          </form>
        </Card>
      </div>
      {del && (
        <Modal title="Super admin silinsin?" onClose={() => setDel(null)}>
          <p className="text-[#3A4150]">
            {del.name} ({del.email}) panelə daha daxil ola bilməyəcək.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Btn kind="ghost" onClick={() => setDel(null)}>Ləğv et</Btn>
            <Btn kind="danger" onClick={remove} disabled={busy}>
              <Trash2 className="w-4 h-4" /> Sil
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}

function AccountView({ me }: { me: Me | null }) {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.next !== f.again) {
      toast.error('Yeni parollar eyni deyil');
      return;
    }
    setBusy(true);
    try {
      await call('/password', 'POST', { current_password: f.current, new_password: f.next });
      toast.success('Parolunuz dəyişdirildi');
      setF({ current: '', next: '', again: '' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead title="Hesabım və parol" sub={me ? me.name + ' · ' + me.email : undefined} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card title="Parolu dəyiş">
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-3 items-start">
            <Field label="Cari parol">
              <input className={inputCls} type="password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field label="Yeni parol" hint="Ən azı 8 simvol">
              <input className={inputCls} type="password" minLength={8} required value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Yeni parol (təkrar)">
              <input className={inputCls} type="password" minLength={8} required value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} autoComplete="new-password" />
            </Field>
            <div className="md:col-span-3">
              <Btn type="submit" disabled={busy}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Parolu dəyiş
              </Btn>
            </div>
          </form>
        </Card>
        <Card title="Təhlükəsizlik">
          <ul className="space-y-2.5 text-[14px] text-[#3A4150]">
            <li className="flex gap-2">
              <UserCog className="w-4 h-4 mt-0.5 text-[#6B7280] shrink-0" /> Hər super admin öz hesabı ilə girsin — parolu paylaşmayın.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 text-[#6B7280] shrink-0" /> Parol ən azı 8 simvol, uzun və təkrarsız olsun.
            </li>
            <li className="flex gap-2">
              <LogOut className="w-4 h-4 mt-0.5 text-[#6B7280] shrink-0" /> Giriş 12 saat keçərlidir, sonra yenidən daxil olursunuz.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}

// ============================================================

export default function SuperPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => setSignedIn(!!token()), []);
  if (signedIn === null) return null;
  const vars = { ['--acc' as any]: C.accent, ['--acc-h' as any]: C.accentHover, ['--acc-s' as any]: C.accentSoft } as React.CSSProperties;
  return (
    <div style={vars}>
      {signedIn ? (
        <Panel
          onOut={() => {
            try {
              localStorage.removeItem(K_TOKEN);
            } catch (e) {}
            window.location.hash = '';
            setSignedIn(false);
          }}
        />
      ) : (
        <Login onIn={() => setSignedIn(true)} />
      )}
    </div>
  );
}
