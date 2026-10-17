'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Heart, GraduationCap, Link2, Layers, CalendarDays, BookOpen, ClipboardCheck,
  FlaskConical, FileText, Target, Library, FolderOpen, ListChecks, Wallet, Receipt, CreditCard, Building2,
  DoorOpen, BookMarked, BarChart3, Megaphone, MessageSquare, KeyRound, Shield, Settings, Award, Menu, X, LogOut,
  Circle, HelpCircle, Inbox, Clock, Send, TrendingUp, Search, Home, Wrench, Banknote, ChevronDown, Copy, Wallet as WalletIcon,
  UserCog, MailOpen, ScrollText,
} from 'lucide-react';
import { auth, getUser, getToken, clearSession, EduUser, saveSession } from '../utils/api';
import { visibleNav, ROLE_THEME, NavItem, Role } from '../nav';
import { buildHubs } from '../hubs';
import { ROLE_LABEL } from '../screens';
import { T } from '../theme';
import Onboarding from './Onboarding';
import NotificationBell from './NotificationBell';
import ProfileModal from './ProfileModal';

// ============================================================
// AppShell — HUB əsaslı naviqasiya (yuxarı hub-lar + alt-tablar + Ctrl+K axtarış)
// Rolu seçilməmiş / admin tərəfindən əlavə edilməmiş istifadəçi
// burada Onboarding ekranını görür (qeydiyyat → rol → kod).
// ============================================================

const ICONS: Record<string, any> = {
  dashboard: LayoutDashboard, students: Users, guardians: Heart, teachers: GraduationCap, links: Link2,
  groups: Layers, enrollments: ClipboardCheck, schedule: CalendarDays, 'schedule-slots': CalendarDays, lessons: BookOpen,
  attendance: ClipboardCheck, placement: Target, exams: FlaskConical, grading: FileText, skills: Target,
  syllabus: Library, materials: FolderOpen, assignments: ListChecks, 'assignment-submissions': Inbox,
  'tuition-plans': Wallet, 'student-tuitions': Receipt, invoices: CreditCard, branches: Building2, rooms: DoorOpen,
  subjects: BookMarked, levels: TrendingUp, reports: BarChart3, announcements: Megaphone, messages: MessageSquare,
  users: KeyRound, 'sub-roles': Shield, settings: Settings, achievements: Award, results: TrendingUp,
  questions: HelpCircle, availability: Clock, 'teacher-availability': Clock,
  email: MailOpen, audit: ScrollText, payments: Receipt,
};

const HUB_ICONS: Record<string, any> = {
  home: Home, people: Users, teaching: CalendarDays, schedule: CalendarDays, groups: Users, subjects: BookMarked, assess: FlaskConical, content: Library, finance: Banknote,
  center: Building2, comm: Megaphone, tasks: ListChecks, child: Heart, results: TrendingUp, more: FolderOpen, other: Circle,
  system: Settings,
};

interface Props {
  activeKey: string;
  activeLabel: string;
  onNavigate: (item: NavItem) => void;
  children: ReactNode;
}

export default function AppShell({ activeKey, activeLabel, onNavigate, children }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<EduUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  const navRef = useRef<NavItem[]>([]);
  const goRef = useRef<(i: NavItem) => void>(() => {});
  const [lastIn, setLastIn] = useState<Record<string, string>>({});
  const [centre, setCentre] = useState('');
  const [profile, setProfile] = useState(false);

  useEffect(() => {
    auth.tenant().then((t) => setCentre(t.name || '')).catch(() => {});
  }, []);

  useEffect(() => {
    if (centre) document.title = centre;
  }, [centre]);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    const cached = getUser();
    if (cached) setUser(cached);
    auth
      .me()
      .then((fresh: any) => {
        if (fresh.token) saveSession(fresh.token, fresh);
        const { token, ...u } = fresh;
        setUser(u as EduUser);
        try {
          localStorage.setItem('edu_user', JSON.stringify(u));
        } catch (e) {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        setQ('');
      }
      if (e.key === 'Escape') {
        setPalette(false);
        setMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const h = (e: any) => {
      const it = (navRef.current || []).find((i: NavItem) => i.key === e.detail);
      if (it) goRef.current(it);
    };
    window.addEventListener('edu-nav', h);
    return () => window.removeEventListener('edu-nav', h);
  }, []);

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: T.accent, borderTopColor: 'transparent' }} />
      </div>
    );
  }
  if (!user) return null;

  if (!user.role || user.status === 'pending') {
    return <Onboarding user={user} onUser={setUser} onLogout={handleLogout} />;
  }

  const role = user.role as Role;
  const theme = ROLE_THEME[role] || ROLE_THEME.admin;
  const items = visibleNav(role, user.permissions || {});
  const hubs = buildHubs(role, items);
  const activeHub = hubs.find((h) => h.items.some((i) => i.key === activeKey)) || hubs[0];

  const go = (item: NavItem) => {
    if (activeHub) {
      const hub = hubs.find((h) => h.items.some((i) => i.key === item.key));
      if (hub) setLastIn((m) => ({ ...m, [hub.id]: item.key }));
    }
    setPalette(false);
    onNavigate(item);
  };
  navRef.current = items;
  goRef.current = go;
  const openHub = (id: string) => {
    const h = hubs.find((x) => x.id === id);
    if (!h) return;
    const remembered = h.items.find((i) => i.key === lastIn[id]);
    go(remembered || h.items[0]);
  };

  const norm = (x: string) => x.toLowerCase().replace(/\u0307/g, '').replace(/ı/g, 'i');
  const results = items
    .map((i) => ({ i, hub: hubs.find((h) => h.items.some((x) => x.key === i.key)) }))
    .filter(({ i, hub }) => !q.trim() || norm(i.label + ' ' + (hub ? hub.label : '')).includes(norm(q.trim())));

  const initials = (user.display_name || user.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.ink }}>
      <header className="sticky top-0 z-30 border-b" style={{ background: 'rgba(250,249,246,.94)', backdropFilter: 'blur(8px)', borderColor: T.line }}>
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: theme.color }}>
              <GraduationCap className="w-[18px] h-[18px]" />
            </div>
            <span className="hidden sm:block text-sm font-semibold max-w-[180px] truncate" title={centre}>{centre || 'Təlim mərkəzi'}</span>
          </div>

          <nav className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {hubs.map((h) => {
              const Icon = HUB_ICONS[h.id] || Circle;
              const on = activeHub && h.id === activeHub.id;
              return (
                <button
                  key={h.id}
                  onClick={() => openHub(h.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13.5px] whitespace-nowrap transition"
                  style={on ? { background: theme.soft, color: theme.color, fontWeight: 600 } : { color: T.inkSoft, fontWeight: 500 }}
                >
                  <Icon className="w-4 h-4" strokeWidth={on ? 2.2 : 1.8} />
                  <span className={on ? '' : 'hidden xl:inline'}>{h.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            onClick={() => { setPalette(true); setQ(''); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs shrink-0"
            style={{ borderColor: T.line, color: T.inkFaint, background: T.surface }}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Axtar…</span>
            <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded" style={{ background: T.lineSoft }}>Ctrl K</kbd>
          </button>

          <NotificationBell color={theme.color} />

          <div className="relative shrink-0">
            <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-1.5">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: theme.soft, color: theme.color }}>
                {initials}
              </span>
              <ChevronDown className="w-3.5 h-3.5" style={{ color: T.inkFaint }} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border bg-white p-2 shadow-lg" style={{ borderColor: T.line }}>
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold truncate">{user.display_name || user.name}</p>
                    <p className="text-xs truncate" style={{ color: T.inkFaint }}>{user.email}</p>
                    <span className="inline-block mt-2 text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: theme.soft, color: theme.color }}>
                      {ROLE_LABEL[role]}
                    </span>
                  </div>
                  {user.code && (
                    <button
                      onClick={() => { try { navigator.clipboard.writeText(user.code || ''); } catch (e) {} setMenu(false); }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm hover:bg-black/5"
                    >
                      <span style={{ color: T.inkSoft }}>Şəxsi kod</span>
                      <span className="flex items-center gap-1.5 tabular-nums font-medium">{user.code} <Copy className="w-3.5 h-3.5" style={{ color: T.inkFaint }} /></span>
                    </button>
                  )}
                  <button
                    onClick={() => { setMenu(false); setProfile(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-black/5"
                    style={{ color: T.ink }}
                  >
                    <UserCog className="w-4 h-4" style={{ color: T.inkSoft }} /> Profil və parol
                  </button>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-black/5" style={{ color: T.bad }}>
                    <LogOut className="w-4 h-4" /> Çıxış
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {activeHub && activeHub.items.length > 1 && (
          <div className="border-t" style={{ borderColor: T.lineSoft }}>
            <div className="max-w-[1240px] mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {activeHub.items.map((it) => {
                const on = it.key === activeKey;
                return (
                  <button
                    key={it.key}
                    onClick={() => go(it)}
                    className="relative px-3 py-2.5 text-[13px] whitespace-nowrap transition"
                    style={{ color: on ? T.ink : T.inkSoft, fontWeight: on ? 600 : 500 }}
                  >
                    {it.label}
                    {on && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full" style={{ background: theme.color }} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-7">
        {activeHub && activeHub.id !== 'home' && (
          <p className="text-xs mb-3 flex items-center gap-1.5" style={{ color: T.inkFaint }}>
            {activeHub.label} <span>/</span> <span style={{ color: T.inkSoft }}>{activeLabel}</span>
          </p>
        )}
        <main className="flex flex-col gap-6 min-w-0 w-full">{children}</main>
      </div>

      {palette && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" style={{ background: 'rgba(28,36,52,.35)' }} onClick={() => setPalette(false)}>
          <div className="w-full max-w-lg rounded-2xl border bg-white shadow-xl overflow-hidden" style={{ borderColor: T.line }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 border-b" style={{ borderColor: T.line }}>
              <Search className="w-4 h-4" style={{ color: T.inkFaint }} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].i); }}
                placeholder="Səhifəyə keç…"
                className="flex-1 py-3.5 text-sm outline-none bg-transparent"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && <p className="px-3 py-6 text-sm text-center" style={{ color: T.inkFaint }}>Tapılmadı</p>}
              {results.map(({ i, hub }) => {
                const Icon = ICONS[i.key] || Circle;
                return (
                  <button key={i.key} onClick={() => go(i)} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-left hover:bg-black/5">
                    <Icon className="w-4 h-4" style={{ color: T.inkSoft }} />
                    <span className="flex-1">{i.label}</span>
                    {hub && <span className="text-xs" style={{ color: T.inkFaint }}>{hub.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {profile && (
        <ProfileModal
          user={user}
          color={theme.color}
          onClose={() => setProfile(false)}
          onUser={(u) => setUser(u)}
        />
      )}
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{scrollbar-width:none}`}</style>
    </div>
  );
}
