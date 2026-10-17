'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/edu/components/AppShell';
import CrudPage from '@/edu/components/CrudPage';
import Dashboard from '@/edu/components/Dashboard';
import ScheduleGrid from '@/edu/components/ScheduleGrid';
import ResultsScreen from '@/edu/components/ResultsScreen';
import SkillsScreen from '@/edu/components/SkillsScreen';
import AchievementsScreen from '@/edu/components/AchievementsScreen';
import AvailabilityGrid from '@/edu/components/AvailabilityGrid';
import AttendanceBoard from '@/edu/components/AttendanceBoard';
import UsersScreen from '@/edu/components/UsersScreen';
import EmailScreen from '@/edu/components/EmailScreen';
import AuditScreen from '@/edu/components/AuditScreen';
import { ReportsScreen, BranchStatsScreen } from '@/edu/components/ReportsScreen';
import { PrincipleNote, ScreenHeader } from '@/edu/components/screen';
import { getResource } from '@/edu/resources';
import { getScreen } from '@/edu/screens';
import { NavItem, ROLE_THEME, Role, NAV } from '@/edu/nav';
import { getUser } from '@/edu/utils/api';

export default function EducationCenterDashboard() {
  const [active, setActive] = useState<NavItem | null>(null);

  const user = getUser();
  const role = (user?.role || 'admin') as Role;
  const color = (ROLE_THEME[role] || ROLE_THEME.admin).color;

  // E-poçtdakı linklər /dashboard?view=<bölmə> ilə gəlir
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('view');
      if (!v) return;
      const it = (NAV[role] || []).find((i) => i.key === v);
      if (it) setActive(it);
      window.history.replaceState(null, '', '/dashboard');
    } catch (e) {}
  }, [role]);

  const item = active || (NAV[role] || NAV.admin)[0];
  const meta = getScreen(role, item.key) || { h1: item.label, sub: '' };

  const renderView = () => {
    // --- Rolun giriş ekranı ---
    if (item.view === 'dashboard') {
      return (
        <Dashboard
          role={role}
          meta={meta}
          color={color}
          userName={user?.display_name || user?.name || ''}
        />
      );
    }

    // --- Həftəlik cədvəl matrisi ---
    if (item.view === 'schedule') {
      return <ScheduleGrid meta={meta} color={color} />;
    }

    // --- Hesabatlar ---
    if (item.view === 'reports') {
      return <ReportsScreen meta={meta} color={color} />;
    }

    // --- İstifadəçilər ---
    if (item.view === 'users') {
      return <UsersScreen meta={meta} color={color} />;
    }

    // --- E-poçt şablonları və jurnal ---
    if (item.view === 'email') {
      return <EmailScreen meta={meta} color={color} />;
    }

    // --- Audit jurnalı ---
    if (item.view === 'audit') {
      return <AuditScreen meta={meta} color={color} />;
    }

    // --- Müəllimin boş saatları: klik edilə bilən grid ---
    if (item.key === 'availability') {
      return <AvailabilityGrid meta={meta} color={color} />;
    }

    // --- Müəllimin davamiyyət lövhəsi ---
    if (role === 'teacher' && item.key === 'attendance') {
      return <AttendanceBoard meta={meta} color={color} />;
    }

    // --- Şagird / valideyn nəticələri: bacarıq sütunları ilə ---
    if (item.key === 'results' && (role === 'student' || role === 'guardian')) {
      return <ResultsScreen meta={meta} color={color} />;
    }

    // --- Güclü / zəif tərəflər ---
    if (item.key === 'skills') {
      return <SkillsScreen meta={meta} color={color} />;
    }

    // --- Nailiyyətlər ---
    if (item.key === 'achievements') {
      return <AchievementsScreen meta={meta} color={color} />;
    }

    // --- Filiallar: CRUD + statistika cədvəli ---
    if (item.key === 'branches') {
      const def = getResource('branches');
      return (
        <>
          {def && <CrudPage def={def} meta={{ ...meta, note: undefined }} color={color} />}
          <BranchStatsScreen meta={meta} color={color} />
          {meta.note && <PrincipleNote note={meta.note} color={color} />}
        </>
      );
    }

    // --- Adi resurs ekranı ---
    if (item.view.indexOf('crud:') === 0) {
      const def = getResource(item.view.slice(5));
      if (def) return <CrudPage def={def} meta={meta} color={color} />;
    }

    return (
      <>
        <ScreenHeader h1={meta.h1} sub={meta.sub} />
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
          <p className="text-sm text-[#64748B]">Bu bölmə hazırlanır.</p>
        </div>
        {meta.note && <PrincipleNote note={meta.note} color={color} />}
      </>
    );
  };

  return (
    <AppShell activeKey={item.key} activeLabel={item.label} onNavigate={setActive}>
      {renderView()}
    </AppShell>
  );
}
